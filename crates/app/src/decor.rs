//! Reading `StageDecorSettings` out of a recipe's layout document.
//!
//! `recipe.layout` is an opaque `serde_json::Value` on purpose: P9 owns the
//! Screens-canvas shape and the catalog only stores it. Decor is the one corner
//! of it P6 needs, so this is the one place that reaches in — under the `decor`
//! key, and nowhere else.
//!
//! A layout with no `decor`, or a `decor` this build cannot read, falls back to
//! the defaults. It is a scatter of shapes: a malformed dial is not a reason to
//! refuse a show, and the frontend would have to defend against the same case
//! anyway.

use questiongame_host::StageDecorSettings;

pub fn of(layout: &serde_json::Value) -> StageDecorSettings {
    layout
        .get("decor")
        .and_then(|decor| serde_json::from_value(decor.clone()).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use questiongame_host::stage::DecorMotionMode;

    #[test]
    fn a_layout_with_no_decor_gets_the_contract_defaults() {
        assert_eq!(of(&serde_json::json!({})), StageDecorSettings::default());
        assert_eq!(
            of(&serde_json::json!({ "decor": { "mode": "nonsense" } })),
            StageDecorSettings::default(),
            "an unreadable dial is not a reason to refuse a show",
        );
    }

    #[test]
    fn the_screens_tab_can_set_the_motion_mode() {
        let layout = serde_json::json!({
            "decor": {
                "mode": "collide-attract",
                "anchor": { "enabled": false, "attractSeconds": 8.0, "repelSeconds": 4.0, "strength": 0.5 },
                "drift": 20.0,
                "attraction": 0.4,
                "bounce": 0.8,
                "spin": 6.0,
                "maxSpeed": 55.0
            }
        });
        let decor = of(&layout);
        assert_eq!(decor.mode, DecorMotionMode::CollideAttract);
        assert_eq!(decor.max_speed, 55.0);
        assert!(!decor.anchor.enabled);
    }
}
