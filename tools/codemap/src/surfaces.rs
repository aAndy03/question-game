//! The build-time surfaces: the windows the app creates, its identity
//! constants, and the Cargo workspace.

use std::collections::BTreeMap;
use std::path::Path;

use quote::ToTokens;
use serde::Serialize;
use serde_json::Value;
use syn::visit::Visit;
use syn::Expr;

use crate::{describe_init, is_cfg_test, str_consts, str_lit, tidy};

// ----------------------------------------------------------------- windows

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WindowInfo {
    /// The label, or `mirror_label()` for the numbered Stage mirrors.
    pub label: String,
    /// The URL constant's value, or empty when it could not be resolved.
    pub url: String,
}

struct WindowVisitor<'a> {
    labels: &'a BTreeMap<String, String>,
    urls: BTreeMap<String, String>,
    lets: Vec<BTreeMap<String, String>>,
    out: Vec<WindowInfo>,
}

impl WindowVisitor<'_> {
    fn label_of(&self, expr: &Expr) -> String {
        match expr {
            Expr::Reference(r) => self.label_of(&r.expr),
            Expr::Path(p) => {
                let Some(ident) = p.path.get_ident() else {
                    return tidy(&expr.to_token_stream().to_string());
                };
                let name = ident.to_string();
                if let Some(v) = self.labels.get(&name) {
                    return v.clone();
                }
                self.lets
                    .last()
                    .and_then(|m| m.get(&name))
                    .cloned()
                    .unwrap_or(name)
            }
            other => str_lit(other).unwrap_or_else(|| tidy(&other.to_token_stream().to_string())),
        }
    }

    fn url_of(&self, expr: &Expr) -> String {
        fn find(
            stream: proc_macro2::TokenStream,
            urls: &BTreeMap<String, String>,
        ) -> Option<String> {
            for tree in stream {
                match tree {
                    proc_macro2::TokenTree::Ident(i) => {
                        if let Some(v) = urls.get(&i.to_string()) {
                            return Some(v.clone());
                        }
                    }
                    proc_macro2::TokenTree::Group(g) => {
                        if let Some(v) = find(g.stream(), urls) {
                            return Some(v);
                        }
                    }
                    _ => {}
                }
            }
            None
        }
        find(expr.to_token_stream(), &self.urls).unwrap_or_default()
    }
}

impl<'ast> Visit<'ast> for WindowVisitor<'_> {
    fn visit_item_mod(&mut self, m: &'ast syn::ItemMod) {
        if !is_cfg_test(&m.attrs) {
            syn::visit::visit_item_mod(self, m);
        }
    }

    fn visit_item_fn(&mut self, f: &'ast syn::ItemFn) {
        if is_cfg_test(&f.attrs) {
            return;
        }
        self.lets.push(BTreeMap::new());
        syn::visit::visit_item_fn(self, f);
        self.lets.pop();
    }

    fn visit_local(&mut self, local: &'ast syn::Local) {
        if let syn::Pat::Ident(id) = &local.pat
            && let Some(init) = &local.init
            && let Some(top) = self.lets.last_mut()
        {
            top.insert(id.ident.to_string(), describe_init(&init.expr));
        }
        syn::visit::visit_local(self, local);
    }

    fn visit_expr_call(&mut self, call: &'ast syn::ExprCall) {
        if let Expr::Path(p) = &*call.func {
            let segs: Vec<String> = p.path.segments.iter().map(|s| s.ident.to_string()).collect();
            let n = segs.len();
            if n >= 2 && segs[n - 2] == "WebviewWindowBuilder" && segs[n - 1] == "new" && call.args.len() == 3 {
                let args: Vec<&Expr> = call.args.iter().collect();
                self.out.push(WindowInfo {
                    label: self.label_of(args[1]),
                    url: self.url_of(args[2]),
                });
            }
        }
        syn::visit::visit_expr_call(self, call);
    }
}

/// Every `WebviewWindowBuilder::new(app, LABEL, url)` in `windows.rs`.
pub fn windows_in(file: &syn::File, labels: &BTreeMap<String, String>) -> Vec<WindowInfo> {
    let (urls, _) = str_consts(file);
    let mut v = WindowVisitor {
        labels,
        urls,
        lets: Vec::new(),
        out: Vec::new(),
    };
    v.visit_file(file);
    v.out.sort_by(|a, b| (&a.label, &a.url).cmp(&(&b.label, &b.url)));
    v.out.dedup();
    v.out
}

/// The `pub const X: &str` identifiers of a file (`identity.rs`).
pub fn identity_consts(file: &syn::File) -> BTreeMap<String, String> {
    str_consts(file).0
}

// ------------------------------------------------------------------- cargo

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrateInfo {
    pub name: String,
    pub path: String,
    pub features: BTreeMap<String, Vec<String>>,
    pub dependencies: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CargoInfo {
    pub members: Vec<String>,
    pub crates: Vec<CrateInfo>,
}

fn dep_spec(value: &Value, workspace: &BTreeMap<String, String>, name: &str) -> String {
    match value {
        Value::String(v) => v.clone(),
        Value::Object(t) => {
            let mut parts = Vec::new();
            if t.get("workspace").and_then(Value::as_bool) == Some(true) {
                parts.push(format!("workspace = {}", workspace.get(name).cloned().unwrap_or_default()));
            }
            if let Some(v) = t.get("version").and_then(Value::as_str) {
                parts.push(v.to_owned());
            }
            if let Some(v) = t.get("path").and_then(Value::as_str) {
                parts.push(format!("path {v}"));
            }
            if let Some(f) = t.get("features").and_then(Value::as_array) {
                let list: Vec<&str> = f.iter().filter_map(Value::as_str).collect();
                if !list.is_empty() {
                    parts.push(format!("features [{}]", list.join(", ")));
                }
            }
            if t.get("default-features").and_then(Value::as_bool) == Some(false) {
                parts.push("no default features".to_owned());
            }
            if t.get("optional").and_then(Value::as_bool) == Some(true) {
                parts.push("optional".to_owned());
            }
            parts.join("; ")
        }
        _ => String::new(),
    }
}

fn collect_deps(
    table: &Value,
    section: &str,
    prefix: &str,
    ws: &BTreeMap<String, String>,
    out: &mut BTreeMap<String, String>,
) {
    if let Some(deps) = table.get(section).and_then(Value::as_object) {
        for (name, spec) in deps {
            let label = match section {
                "dev-dependencies" => format!("{prefix}{name} (dev)"),
                "build-dependencies" => format!("{prefix}{name} (build)"),
                _ => format!("{prefix}{name}"),
            };
            out.insert(label, dep_spec(spec, ws, name));
        }
    }
}

fn read_toml(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    toml::from_str::<Value>(&text).map_err(|e| format!("{}: {e}", path.display()))
}

/// The workspace members, and for each its `[features]` and dependencies.
pub fn cargo_info(repo: &Path) -> Result<CargoInfo, String> {
    let root = read_toml(&repo.join("Cargo.toml"))?;
    let ws_deps_value = root.pointer("/workspace/dependencies").cloned().unwrap_or(Value::Null);
    let mut ws: BTreeMap<String, String> = BTreeMap::new();
    if let Some(map) = ws_deps_value.as_object() {
        for (name, spec) in map {
            ws.insert(name.clone(), dep_spec(spec, &BTreeMap::new(), name));
        }
    }
    let mut members: Vec<String> = root
        .pointer("/workspace/members")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).map(str::to_owned).collect())
        .unwrap_or_default();
    members.sort();
    let mut crates = Vec::new();
    for member in &members {
        let manifest = read_toml(&repo.join(member).join("Cargo.toml"))?;
        let mut info = CrateInfo {
            name: manifest.pointer("/package/name").and_then(Value::as_str).unwrap_or(member).to_owned(),
            path: member.clone(),
            ..CrateInfo::default()
        };
        if let Some(features) = manifest.get("features").and_then(Value::as_object) {
            for (name, list) in features {
                let mut items: Vec<String> = list
                    .as_array()
                    .map(|a| a.iter().filter_map(Value::as_str).map(str::to_owned).collect())
                    .unwrap_or_default();
                items.sort();
                info.features.insert(name.clone(), items);
            }
        }
        for section in ["dependencies", "dev-dependencies", "build-dependencies"] {
            collect_deps(&manifest, section, "", &ws, &mut info.dependencies);
        }
        if let Some(targets) = manifest.get("target").and_then(Value::as_object) {
            for (target, table) in targets {
                for section in ["dependencies", "dev-dependencies", "build-dependencies"] {
                    collect_deps(table, section, &format!("[{target}] "), &ws, &mut info.dependencies);
                }
            }
        }
        crates.push(info);
    }
    crates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(CargoInfo { members, crates })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_resolve_labels_and_urls() {
        let ast = syn::parse_file(
            r#"
            const STUDIO_PATH: &str = "studio/index.html";
            const MIRROR_PATH: &str = "stage/index.html?mirror";
            fn a(app: &App) {
                WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App(STUDIO_PATH.into()));
            }
            fn b(app: &App) {
                let label = mirror_label(2);
                WebviewWindowBuilder::new(app, &label, WebviewUrl::App(MIRROR_PATH.into()));
            }
            #[cfg(test)]
            mod tests { fn t() { WebviewWindowBuilder::new(app, "fake", x); } }
            "#,
        )
        .unwrap();
        let labels = BTreeMap::from([("MAIN".to_owned(), "main".to_owned())]);
        let out = windows_in(&ast, &labels);
        assert_eq!(
            out,
            vec![
                WindowInfo { label: "main".into(), url: "studio/index.html".into() },
                WindowInfo { label: "mirror_label()".into(), url: "stage/index.html?mirror".into() },
            ]
        );
    }

    #[test]
    fn identity_consts_are_the_string_constants() {
        let ast = syn::parse_file(
            r#"
            pub const DEV_IDENTIFIER: &str = "org.questiongame.app";
            pub const NOT_A_STRING: u8 = 1;
            "#,
        )
        .unwrap();
        let consts = identity_consts(&ast);
        assert_eq!(consts.len(), 1);
        assert_eq!(consts["DEV_IDENTIFIER"], "org.questiongame.app");
    }

    #[test]
    fn dependencies_resolve_workspace_specs() {
        let ws = BTreeMap::from([("serde".to_owned(), "1; features [derive]".to_owned())]);
        let spec: Value = serde_json::json!({ "workspace": true });
        assert_eq!(dep_spec(&spec, &ws, "serde"), "workspace = 1; features [derive]");
        let table: Value = serde_json::json!({ "version": "2", "features": ["a"], "default-features": false });
        assert_eq!(dep_spec(&table, &ws, "x"), "2; features [a]; no default features");
    }
}
