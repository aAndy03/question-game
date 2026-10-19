//! The Rust half of `codemap.yaml`.
//!
//! Parses the sources with `syn` and reports the surfaces that can break
//! between versions: IPC commands, emitted events, the guard's allow lists,
//! settings keys, migrations and the host's public API. Nothing here runs the
//! code under analysis, and nothing here knows a line number — a line number
//! would churn the diff on every edit.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use proc_macro2::TokenTree;
use quote::ToTokens;
use serde::Serialize;
use syn::visit::Visit;
use syn::{
    Attribute, Expr, ExprLit, Fields, FnArg, ImplItem, Item, Lit, Meta, ReturnType, Type,
    Visibility,
};

mod surfaces;
pub use surfaces::{CargoInfo, CrateInfo, WindowInfo};

// ------------------------------------------------------------------ output

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Param {
    pub name: String,
    #[serde(rename = "type")]
    pub ty: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandInfo {
    pub name: String,
    pub file: String,
    pub params: Vec<Param>,
    pub returns: String,
    pub doc: Option<String>,
    /// `#[tauri::command(async)]` or an `async fn`.
    pub async_command: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ApiItem {
    pub path: String,
    pub kind: String,
    pub signature: String,
    pub doc: Option<String>,
    pub file: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmitInfo {
    pub function: String,
    pub target: String,
    pub event: String,
    pub payload: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Guard {
    pub labels: BTreeMap<String, String>,
    pub stage_commands: Vec<String>,
    pub stats_commands: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SettingKey {
    #[serde(rename = "type")]
    pub ty: String,
    pub variant: String,
    pub key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub ty: String,
    pub serde_default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructInfo {
    pub name: String,
    pub serde: Option<String>,
    pub fields: Vec<FieldInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MetaConst {
    pub name: String,
    pub value: String,
    pub file: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RustMap {
    pub commands: Vec<CommandInfo>,
    pub guard: Guard,
    pub handlers: Vec<String>,
    pub events: Vec<EmitInfo>,
    pub plugins: Vec<String>,
    pub host_api: Vec<ApiItem>,
    pub app_api: Vec<ApiItem>,
    pub stage_contract_version: Option<String>,
    pub settings_keys: Vec<SettingKey>,
    pub game_affecting_keys: Vec<String>,
    pub settings_structs: Vec<StructInfo>,
    pub migrations: Vec<String>,
    pub meta_keys: Vec<MetaConst>,
    pub identity: BTreeMap<String, String>,
    pub windows: Vec<WindowInfo>,
    pub cargo: CargoInfo,
}

// --------------------------------------------------------------- text helpers

/// Collapse `quote`'s token spacing (`Vec < String >`) into how a person
/// writes it (`Vec<String>`).
pub fn tidy(raw: &str) -> String {
    let mut s = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    for (from, to) in [
        (" :: ", "::"),
        (":: ", "::"),
        (" ::", "::"),
        (" < ", "<"),
        ("< ", "<"),
        (" <", "<"),
        (" >", ">"),
        (" , ", ", "),
        (" ,", ","),
        ("& ", "&"),
        ("( ", "("),
        (" )", ")"),
        ("[ ", "["),
        (" ]", "]"),
        (" ;", ";"),
        (" (", "("),
        (" !", "!"),
    ] {
        while s.contains(from) {
            s = s.replace(from, to);
        }
    }
    s
}

fn text<T: ToTokens>(node: &T) -> String {
    tidy(&node.to_token_stream().to_string())
}

/// The first sentence of a doc comment's first paragraph, on one line.
///
/// A doc line is wrapped by hand at ~80 columns, so "the first line" would end
/// mid-sentence. The paragraph is joined and cut at the first sentence end.
pub fn doc_of(attrs: &[Attribute]) -> Option<String> {
    let mut paragraph: Vec<String> = Vec::new();
    for attr in attrs {
        if !attr.path().is_ident("doc") {
            continue;
        }
        if let Meta::NameValue(nv) = &attr.meta
            && let Expr::Lit(ExprLit {
                lit: Lit::Str(s), ..
            }) = &nv.value
        {
            let value = s.value();
            let line = value.trim();
            if line.is_empty() {
                if paragraph.is_empty() {
                    continue;
                }
                break;
            }
            paragraph.push(line.to_owned());
        }
    }
    if paragraph.is_empty() {
        return None;
    }
    Some(first_sentence(&paragraph.join(" ")))
}

/// Up to and including the first `.`, `?` or `!` followed by a space (a `.`
/// after a digit is a section number such as `§12.6.`, not an end); the whole
/// text when there is none. Capped at 200 characters.
pub fn first_sentence(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut end = chars.len();
    for i in 0..chars.len() {
        let after_digit = chars[i] == '.' && i > 0 && chars[i - 1].is_ascii_digit();
        if matches!(chars[i], '.' | '?' | '!')
            && !after_digit
            && chars.get(i + 1).is_some_and(|c| *c == ' ')
        {
            end = i + 1;
            break;
        }
    }
    let cut: String = chars[..end].iter().collect();
    if cut.chars().count() > 200 {
        let head: String = cut.chars().take(197).collect();
        format!("{head}...")
    } else {
        cut
    }
}

pub(crate) fn is_cfg_test(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|attr| {
        if !attr.path().is_ident("cfg") {
            return false;
        }
        let Meta::List(list) = &attr.meta else {
            return false;
        };
        let mut has_test = false;
        let mut has_not = false;
        for tree in list.tokens.clone() {
            if let TokenTree::Ident(ident) = tree {
                if ident == "test" {
                    has_test = true;
                }
                if ident == "not" {
                    has_not = true;
                }
            }
        }
        has_test && !has_not
    })
}

fn is_pub(vis: &Visibility) -> bool {
    matches!(vis, Visibility::Public(_))
}

pub(crate) fn str_lit(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Lit(ExprLit {
            lit: Lit::Str(s), ..
        }) => Some(s.value()),
        Expr::Reference(r) => str_lit(&r.expr),
        Expr::Group(g) => str_lit(&g.expr),
        _ => None,
    }
}

/// Every string literal of an array expression (`&[ "a", "b" ]`, `["a"]`).
fn str_array(expr: &Expr) -> Option<Vec<String>> {
    match expr {
        Expr::Reference(r) => str_array(&r.expr),
        Expr::Group(g) => str_array(&g.expr),
        Expr::Array(a) => a.elems.iter().map(str_lit).collect(),
        _ => None,
    }
}

fn rel(repo: &Path, path: &Path) -> String {
    path.strip_prefix(repo)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

// ------------------------------------------------------------------ walking

/// One parsed source file of a crate.
pub struct SourceFile {
    pub rel: String,
    pub modpath: Vec<String>,
    /// Reachable from the crate root through `pub mod`s only.
    pub public: bool,
    pub ast: syn::File,
}

fn parse(path: &Path) -> Result<syn::File, String> {
    let src = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    syn::parse_file(&src).map_err(|e| format!("{}: {e}", path.display()))
}

/// Follow `mod x;` declarations from a crate root. Test modules are skipped.
pub fn walk_crate(repo: &Path, root_file: &Path) -> Result<Vec<SourceFile>, String> {
    let mut out = Vec::new();
    walk_file(repo, root_file, &[], true, true, &mut out)?;
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(out)
}

fn walk_file(
    repo: &Path,
    file: &Path,
    modpath: &[String],
    public: bool,
    is_root: bool,
    out: &mut Vec<SourceFile>,
) -> Result<(), String> {
    let ast = parse(file)?;
    let stem = file.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let dir = file.parent().unwrap_or(Path::new("."));
    let children_dir: PathBuf = if is_root || stem == "mod" {
        dir.to_path_buf()
    } else {
        dir.join(stem)
    };
    let mut children = Vec::new();
    for item in &ast.items {
        if let Item::Mod(m) = item
            && m.content.is_none()
            && !is_cfg_test(&m.attrs)
        {
            children.push((m.ident.to_string(), is_pub(&m.vis)));
        }
    }
    out.push(SourceFile {
        rel: rel(repo, file),
        modpath: modpath.to_vec(),
        public,
        ast,
    });
    for (name, is_public) in children {
        let flat = children_dir.join(format!("{name}.rs"));
        let nested = children_dir.join(&name).join("mod.rs");
        let path = if flat.exists() { flat } else { nested };
        let mut child_path = modpath.to_vec();
        child_path.push(name);
        walk_file(repo, &path, &child_path, public && is_public, false, out)?;
    }
    Ok(())
}

// -------------------------------------------------------------- pub API

fn fn_signature(sig: &syn::Signature) -> String {
    let params = sig
        .inputs
        .iter()
        .map(|arg| match arg {
            FnArg::Receiver(r) => text(r),
            FnArg::Typed(p) => format!("{}: {}", text(&p.pat), text(&p.ty)),
        })
        .collect::<Vec<_>>()
        .join(", ");
    let ret = match &sig.output {
        ReturnType::Default => String::new(),
        ReturnType::Type(_, ty) => format!(" -> {}", text(ty)),
    };
    let generics = if sig.generics.params.is_empty() {
        String::new()
    } else {
        text(&sig.generics)
    };
    format!(
        "{}{}fn {}{}({}){}",
        if sig.constness.is_some() { "const " } else { "" },
        if sig.asyncness.is_some() { "async " } else { "" },
        sig.ident,
        generics,
        params,
        ret
    )
}

fn fields_summary(fields: &Fields) -> String {
    match fields {
        Fields::Unit => String::new(),
        Fields::Named(named) => {
            let list = named
                .named
                .iter()
                .filter(|f| is_pub(&f.vis))
                .map(|f| {
                    format!(
                        "{}: {}",
                        f.ident.as_ref().map(ToString::to_string).unwrap_or_default(),
                        text(&f.ty)
                    )
                })
                .collect::<Vec<_>>()
                .join(", ");
            format!(" {{ {list} }}")
        }
        Fields::Unnamed(unnamed) => {
            let list = unnamed
                .unnamed
                .iter()
                .map(|f| {
                    if is_pub(&f.vis) {
                        text(&f.ty)
                    } else {
                        "_".to_owned()
                    }
                })
                .collect::<Vec<_>>()
                .join(", ");
            format!("({list})")
        }
    }
}

fn const_value(expr: &Expr) -> String {
    let value = text(expr);
    if value.len() > 90 {
        let head: String = value.chars().take(87).collect();
        format!("{head}...")
    } else {
        value
    }
}

fn api_item(
    krate: &str,
    modpath: &[String],
    name: &str,
    kind: &str,
    signature: String,
    doc: Option<String>,
    file: &str,
) -> ApiItem {
    let mut path = krate.to_owned();
    for part in modpath {
        path.push_str("::");
        path.push_str(part);
    }
    if !name.is_empty() {
        path.push_str("::");
        path.push_str(name);
    }
    ApiItem {
        path,
        kind: kind.to_owned(),
        signature,
        doc,
        file: file.to_owned(),
    }
}

fn collect_items(
    krate: &str,
    items: &[Item],
    modpath: &[String],
    file: &str,
    out: &mut Vec<ApiItem>,
) {
    for item in items {
        match item {
            Item::Fn(f) if is_pub(&f.vis) && !is_cfg_test(&f.attrs) => out.push(api_item(
                krate,
                modpath,
                &f.sig.ident.to_string(),
                "fn",
                fn_signature(&f.sig),
                doc_of(&f.attrs),
                file,
            )),
            Item::Struct(s) if is_pub(&s.vis) && !is_cfg_test(&s.attrs) => out.push(api_item(
                krate,
                modpath,
                &s.ident.to_string(),
                "struct",
                format!(
                    "struct {}{}{}",
                    s.ident,
                    if s.generics.params.is_empty() {
                        String::new()
                    } else {
                        text(&s.generics)
                    },
                    fields_summary(&s.fields)
                ),
                doc_of(&s.attrs),
                file,
            )),
            Item::Enum(e) if is_pub(&e.vis) && !is_cfg_test(&e.attrs) => {
                let variants = e
                    .variants
                    .iter()
                    .map(|v| {
                        let payload = match &v.fields {
                            Fields::Unit => String::new(),
                            Fields::Unnamed(u) => format!(
                                "({})",
                                u.unnamed.iter().map(|f| text(&f.ty)).collect::<Vec<_>>().join(", ")
                            ),
                            Fields::Named(n) => format!(
                                " {{ {} }}",
                                n.named
                                    .iter()
                                    .map(|f| format!(
                                        "{}: {}",
                                        f.ident.as_ref().map(ToString::to_string).unwrap_or_default(),
                                        text(&f.ty)
                                    ))
                                    .collect::<Vec<_>>()
                                    .join(", ")
                            ),
                        };
                        format!("{}{}", v.ident, payload)
                    })
                    .collect::<Vec<_>>()
                    .join(" | ");
                out.push(api_item(
                    krate,
                    modpath,
                    &e.ident.to_string(),
                    "enum",
                    format!("enum {} {{ {} }}", e.ident, variants),
                    doc_of(&e.attrs),
                    file,
                ));
            }
            Item::Trait(t) if is_pub(&t.vis) && !is_cfg_test(&t.attrs) => {
                let methods = t
                    .items
                    .iter()
                    .filter_map(|i| match i {
                        syn::TraitItem::Fn(f) => Some(f.sig.ident.to_string()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                out.push(api_item(
                    krate,
                    modpath,
                    &t.ident.to_string(),
                    "trait",
                    format!("trait {} {{ {} }}", t.ident, methods),
                    doc_of(&t.attrs),
                    file,
                ));
            }
            Item::Const(c) if is_pub(&c.vis) && !is_cfg_test(&c.attrs) => out.push(api_item(
                krate,
                modpath,
                &c.ident.to_string(),
                "const",
                format!("const {}: {} = {}", c.ident, text(&c.ty), const_value(&c.expr)),
                doc_of(&c.attrs),
                file,
            )),
            Item::Static(c) if is_pub(&c.vis) && !is_cfg_test(&c.attrs) => out.push(api_item(
                krate,
                modpath,
                &c.ident.to_string(),
                "static",
                format!("static {}: {}", c.ident, text(&c.ty)),
                doc_of(&c.attrs),
                file,
            )),
            Item::Type(t) if is_pub(&t.vis) && !is_cfg_test(&t.attrs) => out.push(api_item(
                krate,
                modpath,
                &t.ident.to_string(),
                "type",
                format!("type {} = {}", t.ident, text(&t.ty)),
                doc_of(&t.attrs),
                file,
            )),
            Item::Mod(m) if is_pub(&m.vis) && !is_cfg_test(&m.attrs) => {
                out.push(api_item(
                    krate,
                    modpath,
                    &m.ident.to_string(),
                    "mod",
                    format!("mod {}", m.ident),
                    doc_of(&m.attrs),
                    file,
                ));
                if let Some((_, inner)) = &m.content {
                    let mut deeper = modpath.to_vec();
                    deeper.push(m.ident.to_string());
                    collect_items(krate, inner, &deeper, file, out);
                }
            }
            Item::Impl(i) if i.trait_.is_none() && !is_cfg_test(&i.attrs) => {
                let self_ty = text(&i.self_ty);
                // `impl<T> Foo<T>` is still `Foo`.
                let owner = self_ty.split('<').next().unwrap_or(&self_ty).to_owned();
                for member in &i.items {
                    match member {
                        ImplItem::Fn(f) if is_pub(&f.vis) && !is_cfg_test(&f.attrs) => {
                            out.push(api_item(
                                krate,
                                modpath,
                                &format!("{owner}::{}", f.sig.ident),
                                "method",
                                fn_signature(&f.sig),
                                doc_of(&f.attrs),
                                file,
                            ));
                        }
                        ImplItem::Const(c) if is_pub(&c.vis) && !is_cfg_test(&c.attrs) => {
                            out.push(api_item(
                                krate,
                                modpath,
                                &format!("{owner}::{}", c.ident),
                                "const",
                                format!(
                                    "const {}: {} = {}",
                                    c.ident,
                                    text(&c.ty),
                                    const_value(&c.expr)
                                ),
                                doc_of(&c.attrs),
                                file,
                            ));
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
}

/// Every `pub` item reachable through `pub mod`s. Test modules, `pub(crate)`
/// and `pub(super)` are not public API and are not listed.
pub fn public_api(krate: &str, files: &[SourceFile]) -> Vec<ApiItem> {
    let mut out = Vec::new();
    for file in files.iter().filter(|f| f.public) {
        collect_items(krate, &file.ast.items, &file.modpath, &file.rel, &mut out);
    }
    out.sort_by(|a, b| (&a.path, &a.kind, &a.signature).cmp(&(&b.path, &b.kind, &b.signature)));
    out
}

// --------------------------------------------------------------- commands

const INJECTED: [&str; 5] = ["WebviewWindow", "Window", "Webview", "AppHandle", "State"];

fn peel(ty: &Type) -> &Type {
    match ty {
        Type::Reference(r) => peel(&r.elem),
        Type::Group(g) => peel(&g.elem),
        Type::Paren(p) => peel(&p.elem),
        other => other,
    }
}

fn is_injected(ty: &Type) -> bool {
    match peel(ty) {
        Type::Path(p) => p
            .path
            .segments
            .last()
            .is_some_and(|s| INJECTED.contains(&s.ident.to_string().as_str())),
        _ => false,
    }
}

fn command_attr(attrs: &[Attribute]) -> Option<&Attribute> {
    attrs
        .iter()
        .find(|a| a.path().segments.last().is_some_and(|s| s.ident == "command"))
}

fn attr_mentions(attr: &Attribute, word: &str) -> bool {
    match &attr.meta {
        Meta::List(list) => list
            .tokens
            .clone()
            .into_iter()
            .any(|t| matches!(t, TokenTree::Ident(i) if i == word)),
        _ => false,
    }
}

/// Every `#[tauri::command]` function in a file.
pub fn commands_in(file: &syn::File, rel_path: &str) -> Vec<CommandInfo> {
    let mut out = Vec::new();
    for item in &file.items {
        let Item::Fn(f) = item else { continue };
        let Some(attr) = command_attr(&f.attrs) else {
            continue;
        };
        let params = f
            .sig
            .inputs
            .iter()
            .filter_map(|arg| match arg {
                FnArg::Typed(p) if !is_injected(&p.ty) => Some(Param {
                    name: text(&p.pat),
                    ty: text(&p.ty),
                }),
                _ => None,
            })
            .collect();
        let returns = match &f.sig.output {
            ReturnType::Default => "()".to_owned(),
            ReturnType::Type(_, ty) => text(ty),
        };
        out.push(CommandInfo {
            name: f.sig.ident.to_string(),
            file: rel_path.to_owned(),
            params,
            returns,
            doc: doc_of(&f.attrs),
            async_command: f.sig.asyncness.is_some() || attr_mentions(attr, "async"),
        });
    }
    out
}

// ------------------------------------------------------------------ guard

pub(crate) fn str_consts(file: &syn::File) -> (BTreeMap<String, String>, BTreeMap<String, Vec<String>>) {
    let mut strings = BTreeMap::new();
    let mut arrays = BTreeMap::new();
    for item in &file.items {
        if let Item::Const(c) = item {
            if let Some(v) = str_lit(&c.expr) {
                strings.insert(c.ident.to_string(), v);
            } else if let Some(v) = str_array(&c.expr) {
                arrays.insert(c.ident.to_string(), v);
            }
        }
    }
    (strings, arrays)
}

pub fn guard_of(file: &syn::File) -> Guard {
    let (labels, arrays) = str_consts(file);
    let mut guard = Guard {
        labels,
        ..Guard::default()
    };
    if let Some(v) = arrays.get("STAGE_COMMANDS") {
        guard.stage_commands = v.clone();
    }
    if let Some(v) = arrays.get("STATS_COMMANDS") {
        guard.stats_commands = v.clone();
    }
    guard
}

// --------------------------------------------------------------- handlers

struct MacroVisitor {
    handlers: Vec<String>,
    plugins: Vec<String>,
}

impl<'ast> Visit<'ast> for MacroVisitor {
    fn visit_macro(&mut self, mac: &'ast syn::Macro) {
        if mac
            .path
            .segments
            .last()
            .is_some_and(|s| s.ident == "generate_handler")
        {
            let mut last: Option<String> = None;
            for tree in mac.tokens.clone() {
                match tree {
                    TokenTree::Punct(p) if p.as_char() == ',' => {
                        if let Some(name) = last.take() {
                            self.handlers.push(name);
                        }
                    }
                    TokenTree::Ident(i) => last = Some(i.to_string()),
                    _ => {}
                }
            }
            if let Some(name) = last {
                self.handlers.push(name);
            }
        }
        syn::visit::visit_macro(self, mac);
    }

    fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
        if call.method == "plugin"
            && let Some(Expr::Call(inner)) = call.args.first()
        {
            self.plugins.push(text(&inner.func));
        }
        syn::visit::visit_expr_method_call(self, call);
    }
}

/// `(handlers registered with generate_handler!, plugins on the builder)`.
pub fn registrations(file: &syn::File) -> (Vec<String>, Vec<String>) {
    let mut v = MacroVisitor {
        handlers: Vec::new(),
        plugins: Vec::new(),
    };
    v.visit_file(file);
    (v.handlers, v.plugins)
}

// ----------------------------------------------------------------- events

#[derive(Default)]
struct FnCtx {
    name: String,
    params: BTreeMap<String, String>,
    lets: BTreeMap<String, String>,
    loops: BTreeMap<String, String>,
}

struct EmitVisitor<'a> {
    labels: &'a BTreeMap<String, String>,
    stack: Vec<FnCtx>,
    out: Vec<EmitInfo>,
}

pub(crate) fn describe_init(expr: &Expr) -> String {
    match expr {
        Expr::MethodCall(m) => format!("{}()", m.method),
        Expr::Call(c) => format!("{}()", text(&c.func)),
        Expr::Reference(r) => describe_init(&r.expr),
        other => text(other),
    }
}

impl EmitVisitor<'_> {
    fn ctx(&self) -> Option<&FnCtx> {
        self.stack.last()
    }

    fn target(&self, expr: &Expr) -> String {
        if let Some(lit) = str_lit(expr) {
            return lit;
        }
        if let Expr::Path(p) = expr
            && let Some(ident) = p.path.get_ident()
        {
            let name = ident.to_string();
            if let Some(value) = self.labels.get(&name) {
                return value.clone();
            }
            if let Some(iter) = self.ctx().and_then(|c| c.loops.get(&name)) {
                return iter.clone();
            }
            return name;
        }
        text(expr)
    }

    fn payload(&self, expr: &Expr) -> String {
        match expr {
            Expr::Reference(r) => self.payload(&r.expr),
            Expr::Struct(s) => s
                .path
                .segments
                .last()
                .map(|seg| seg.ident.to_string())
                .unwrap_or_default(),
            Expr::Macro(m) => format!("{}!", text(&m.mac.path)),
            Expr::Tuple(t) if t.elems.is_empty() => "()".to_owned(),
            Expr::Path(p) => {
                let Some(ident) = p.path.get_ident() else {
                    return text(expr);
                };
                let name = ident.to_string();
                if let Some(ctx) = self.ctx() {
                    if let Some(ty) = ctx.params.get(&name) {
                        return ty.clone();
                    }
                    if let Some(init) = ctx.lets.get(&name) {
                        return init.clone();
                    }
                }
                name
            }
            other => text(other),
        }
    }

    fn enter(&mut self, name: String, sig: &syn::Signature) {
        let mut ctx = FnCtx {
            name,
            ..FnCtx::default()
        };
        for arg in &sig.inputs {
            if let FnArg::Typed(p) = arg
                && let syn::Pat::Ident(id) = &*p.pat
            {
                let ty = text(&p.ty);
                ctx.params
                    .insert(id.ident.to_string(), ty.trim_start_matches('&').to_owned());
            }
        }
        self.stack.push(ctx);
    }
}

impl<'ast> Visit<'ast> for EmitVisitor<'_> {
    fn visit_item_fn(&mut self, f: &'ast syn::ItemFn) {
        self.enter(f.sig.ident.to_string(), &f.sig);
        syn::visit::visit_item_fn(self, f);
        self.stack.pop();
    }

    fn visit_impl_item_fn(&mut self, f: &'ast syn::ImplItemFn) {
        self.enter(f.sig.ident.to_string(), &f.sig);
        syn::visit::visit_impl_item_fn(self, f);
        self.stack.pop();
    }

    fn visit_local(&mut self, local: &'ast syn::Local) {
        if let syn::Pat::Ident(id) = &local.pat
            && let Some(init) = &local.init
        {
            let described = describe_init(&init.expr);
            if let Some(ctx) = self.stack.last_mut() {
                ctx.lets.insert(id.ident.to_string(), described);
            }
        }
        syn::visit::visit_local(self, local);
    }

    fn visit_expr_for_loop(&mut self, lp: &'ast syn::ExprForLoop) {
        if let syn::Pat::Ident(id) = &*lp.pat {
            let described = describe_init(&lp.expr);
            if let Some(ctx) = self.stack.last_mut() {
                ctx.loops.insert(id.ident.to_string(), described);
            }
        }
        syn::visit::visit_expr_for_loop(self, lp);
    }

    fn visit_expr_method_call(&mut self, call: &'ast syn::ExprMethodCall) {
        if call.method == "emit_to" && call.args.len() == 3 {
            let args: Vec<&Expr> = call.args.iter().collect();
            if let Some(event) = str_lit(args[1]) {
                let function = self.ctx().map(|c| c.name.clone()).unwrap_or_default();
                let info = EmitInfo {
                    function,
                    target: self.target(args[0]),
                    event,
                    payload: self.payload(args[2]),
                };
                self.out.push(info);
            }
        }
        syn::visit::visit_expr_method_call(self, call);
    }
}

pub fn emits_in(file: &syn::File, labels: &BTreeMap<String, String>) -> Vec<EmitInfo> {
    let mut v = EmitVisitor {
        labels,
        stack: Vec::new(),
        out: Vec::new(),
    };
    v.visit_file(file);
    v.out
}

// --------------------------------------------------------------- settings

struct KeyArms<'a> {
    owner: &'a str,
    out: &'a mut Vec<SettingKey>,
}

impl<'ast> Visit<'ast> for KeyArms<'_> {
    fn visit_expr_match(&mut self, m: &'ast syn::ExprMatch) {
        for arm in &m.arms {
            if let Some(key) = str_lit(&arm.body) {
                self.out.push(SettingKey {
                    ty: self.owner.to_owned(),
                    variant: text(&arm.pat),
                    key,
                });
            }
        }
        syn::visit::visit_expr_match(self, m);
    }
}

/// The string literal each arm of an `fn key(..)` returns.
pub fn setting_keys(file: &syn::File) -> Vec<SettingKey> {
    let mut out = Vec::new();
    for item in &file.items {
        let Item::Impl(i) = item else { continue };
        if i.trait_.is_some() {
            continue;
        }
        let owner = text(&i.self_ty);
        for member in &i.items {
            if let ImplItem::Fn(f) = member
                && f.sig.ident == "key"
            {
                let mut v = KeyArms {
                    owner: &owner,
                    out: &mut out,
                };
                v.visit_block(&f.block);
            }
        }
    }
    out
}

fn serde_tokens(attrs: &[Attribute]) -> Option<Meta> {
    attrs.iter().find(|a| a.path().is_ident("serde")).map(|a| a.meta.clone())
}

fn serde_has_default(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|a| {
        a.path().is_ident("serde")
            && matches!(&a.meta, Meta::List(l) if l.tokens.clone().into_iter().any(
                |t| matches!(t, TokenTree::Ident(i) if i == "default")))
    })
}

pub fn struct_info(file: &syn::File, name: &str) -> Option<StructInfo> {
    for item in &file.items {
        if let Item::Struct(s) = item
            && s.ident == name
        {
            let fields = match &s.fields {
                Fields::Named(named) => named
                    .named
                    .iter()
                    .map(|f| FieldInfo {
                        name: f.ident.as_ref().map(ToString::to_string).unwrap_or_default(),
                        ty: text(&f.ty),
                        serde_default: serde_has_default(&f.attrs),
                    })
                    .collect(),
                _ => Vec::new(),
            };
            return Some(StructInfo {
                name: name.to_owned(),
                serde: serde_tokens(&s.attrs).map(|m| match m {
                    Meta::List(l) => tidy(&l.tokens.to_string()),
                    other => text(&other),
                }),
                fields,
            });
        }
    }
    None
}

// ---------------------------------------------------------------- storage

pub fn migrations_in(file: &syn::File) -> Vec<String> {
    for item in &file.items {
        if let Item::Const(c) = item
            && c.ident == "MIGRATIONS"
            && let Some(list) = str_array(&c.expr)
        {
            return list;
        }
    }
    Vec::new()
}

pub fn meta_consts(file: &syn::File, rel_path: &str) -> Vec<MetaConst> {
    file.items
        .iter()
        .filter_map(|item| match item {
            Item::Const(c) if c.ident.to_string().starts_with("META_") => {
                str_lit(&c.expr).map(|value| MetaConst {
                    name: c.ident.to_string(),
                    value,
                    file: rel_path.to_owned(),
                })
            }
            _ => None,
        })
        .collect()
}

pub fn const_literal(file: &syn::File, name: &str) -> Option<String> {
    file.items.iter().find_map(|item| match item {
        Item::Const(c) if c.ident == name => Some(text(&c.expr)),
        _ => None,
    })
}

// ------------------------------------------------------------------- main

fn find<'a>(files: &'a [SourceFile], suffix: &str) -> Option<&'a SourceFile> {
    files.iter().find(|f| f.rel.ends_with(suffix))
}

/// Read both crates under `repo` and build the Rust half of the map.
pub fn extract(repo: &Path) -> Result<RustMap, String> {
    let app = walk_crate(repo, &repo.join("crates/app/src/lib.rs"))?;
    let host = walk_crate(repo, &repo.join("crates/host/src/lib.rs"))?;
    let mut map = RustMap::default();

    for file in &app {
        map.commands.extend(commands_in(&file.ast, &file.rel));
    }
    map.commands.sort_by(|a, b| a.name.cmp(&b.name));

    if let Some(guard) = find(&app, "crates/app/src/guard.rs") {
        map.guard = guard_of(&guard.ast);
    }
    if let Some(lib) = find(&app, "crates/app/src/lib.rs") {
        let (mut handlers, mut plugins) = registrations(&lib.ast);
        handlers.sort();
        plugins.sort();
        map.handlers = handlers;
        map.plugins = plugins;
    }
    if let Some(emit) = find(&app, "crates/app/src/emit.rs") {
        map.events = emits_in(&emit.ast, &map.guard.labels);
        map.events
            .sort_by(|a, b| (&a.event, &a.target, &a.function).cmp(&(&b.event, &b.target, &b.function)));
    }

    map.host_api = public_api("questiongame_host", &host);
    let command_names: Vec<&str> = map.commands.iter().map(|c| c.name.as_str()).collect();
    map.app_api = public_api("questiongame_app", &app)
        .into_iter()
        .filter(|i| matches!(i.kind.as_str(), "mod" | "fn"))
        .filter(|i| !(i.kind == "fn" && command_names.iter().any(|n| i.path.ends_with(&format!("::{n}")))))
        .collect();

    if let Some(stage) = find(&host, "crates/host/src/stage.rs") {
        map.stage_contract_version = const_literal(&stage.ast, "CONTRACT_VERSION");
    }
    for suffix in ["crates/host/src/flags.rs", "crates/host/src/settings.rs"] {
        if let Some(file) = find(&host, suffix) {
            map.settings_keys.extend(setting_keys(&file.ast));
        }
    }
    map.settings_keys
        .sort_by(|a, b| (&a.key, &a.ty, &a.variant).cmp(&(&b.key, &b.ty, &b.variant)));
    if let Some(flags) = find(&host, "crates/host/src/flags.rs") {
        let (_, arrays) = str_consts(&flags.ast);
        map.game_affecting_keys = arrays.get("GAME_AFFECTING_KEYS").cloned().unwrap_or_default();
        for name in ["GlobalSettings", "GameSettings"] {
            map.settings_structs.extend(struct_info(&flags.ast, name));
        }
    }
    if let Some(db) = find(&host, "crates/host/src/catalog/db.rs") {
        map.migrations = migrations_in(&db.ast);
    }
    for file in &host {
        map.meta_keys.extend(meta_consts(&file.ast, &file.rel));
    }
    map.meta_keys.sort_by(|a, b| a.name.cmp(&b.name));
    if let Some(identity) = find(&app, "crates/app/src/identity.rs") {
        map.identity = surfaces::identity_consts(&identity.ast);
    }
    if let Some(windows) = find(&app, "crates/app/src/windows.rs") {
        map.windows = surfaces::windows_in(&windows.ast, &map.guard.labels);
    }
    map.cargo = surfaces::cargo_info(repo)?;
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(src: &str) -> syn::File {
        syn::parse_file(src).expect("test source parses")
    }

    #[test]
    fn a_command_drops_the_params_tauri_injects() {
        let ast = file(
            r#"
            /// Put a recipe into Control.
            ///
            /// More detail.
            #[tauri::command(async)]
            pub fn play_load(
                window: WebviewWindow,
                app: AppHandle,
                state: State<'_, AppState>,
                recipe_id: RecipeId,
                tags: Vec<String>,
            ) -> AppResult<()> { Ok(()) }

            fn helper() {}
            "#,
        );
        let commands = commands_in(&ast, "crates/app/src/commands/play.rs");
        assert_eq!(commands.len(), 1);
        let c = &commands[0];
        assert_eq!(c.name, "play_load");
        assert_eq!(c.doc.as_deref(), Some("Put a recipe into Control."));
        assert_eq!(c.returns, "AppResult<()>");
        assert!(c.async_command);
        assert_eq!(
            c.params,
            vec![
                Param { name: "recipe_id".into(), ty: "RecipeId".into() },
                Param { name: "tags".into(), ty: "Vec<String>".into() },
            ]
        );
    }

    #[test]
    fn a_pub_item_keeps_its_first_doc_line_and_private_ones_are_skipped() {
        let ast = file(
            r#"
            /// Is it so?
            /// Second line.
            pub fn ok(x: &str, y: Option<u8>) -> bool { true }
            pub(crate) fn hidden() {}
            fn private() {}
            pub struct Pair { pub a: u32, b: u32 }
            pub enum Mode { On, Off(u8) }
            pub struct Thing;
            impl Thing {
                /// Make one.
                pub fn new() -> Self { Thing }
                fn secret(&self) {}
            }
            "#,
        );
        let mut out = Vec::new();
        collect_items("k", &ast.items, &[], "src/lib.rs", &mut out);
        let by: BTreeMap<_, _> = out.iter().map(|i| (i.path.clone(), i)).collect();
        assert_eq!(by["k::ok"].doc.as_deref(), Some("Is it so?"));
        assert_eq!(by["k::ok"].signature, "fn ok(x: &str, y: Option<u8>) -> bool");
        assert_eq!(by["k::Pair"].signature, "struct Pair { a: u32 }");
        assert_eq!(by["k::Mode"].signature, "enum Mode { On | Off(u8) }");
        assert_eq!(by["k::Thing::new"].kind, "method");
        assert!(!by.contains_key("k::hidden"));
        assert!(!by.contains_key("k::private"));
        assert!(!by.contains_key("k::Thing::secret"));
    }

    #[test]
    fn a_cfg_test_module_is_skipped() {
        let ast = file(
            r#"
            pub fn real() {}
            #[cfg(test)]
            pub mod tests { pub fn fake() {} }
            #[cfg(test)]
            pub fn only_in_tests() {}
            pub mod inner { pub fn nested() {} }
            "#,
        );
        let mut out = Vec::new();
        collect_items("k", &ast.items, &[], "src/lib.rs", &mut out);
        let paths: Vec<_> = out.iter().map(|i| i.path.as_str()).collect();
        assert!(paths.contains(&"k::real"));
        assert!(paths.contains(&"k::inner::nested"));
        assert!(!paths.iter().any(|p| p.contains("fake") || p.contains("only_in_tests")));
    }

    #[test]
    fn emit_to_calls_resolve_their_target_and_payload() {
        let ast = file(
            r#"
            pub fn recipe_changed(app: &AppHandle, change: &RecipeChange) {
                let _ = app.emit_to(MAIN, "recipe-changed", change);
            }
            pub fn play_state(app: &AppHandle) {
                let stage = host.stage_state(1);
                for label in stage_labels(app) {
                    let _ = app.emit_to(label, "play-state", &stage);
                }
            }
            "#,
        );
        let labels = BTreeMap::from([("MAIN".to_owned(), "main".to_owned())]);
        let out = emits_in(&ast, &labels);
        assert_eq!(out[0].target, "main");
        assert_eq!(out[0].payload, "RecipeChange");
        assert_eq!(out[1].target, "stage_labels()");
        assert_eq!(out[1].payload, "stage_state()");
    }

    #[test]
    fn setting_keys_read_the_literal_of_each_arm() {
        let ast = file(
            r#"
            impl GameSetting {
                pub fn key(&self) -> &'static str {
                    match self {
                        GameSetting::ScoringMode(_) => "scoring.mode",
                        GameSetting::Reveal(channel, _) => channel.key(),
                    }
                }
            }
            "#,
        );
        let keys = setting_keys(&ast);
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].key, "scoring.mode");
        assert_eq!(keys[0].ty, "GameSetting");
    }

    #[test]
    fn handlers_and_plugins_are_read_from_the_builder() {
        let ast = file(
            r#"
            fn run() {
                tauri::Builder::default().plugin(some_plugin::init(|a| {}));
            }
            fn handlers() { tauri::generate_handler![ commands::app::a, commands::play::b, ] }
            "#,
        );
        let (handlers, plugins) = registrations(&ast);
        assert_eq!(handlers, vec!["a", "b"]);
        assert_eq!(plugins, vec!["some_plugin::init"]);
    }

    #[test]
    fn tidy_removes_token_spacing() {
        assert_eq!(tidy("Vec < Vec < T > >"), "Vec<Vec<T>>");
        assert_eq!(tidy("& 'a mut tauri :: State < 'static , A >"), "&'a mut tauri::State<'static, A>");
    }
}
