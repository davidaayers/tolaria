//! Parsing of `automations/*.yml` into the shape the renderer consumes (ADR-0302).

use crate::vault::FilterGroup;
use serde::Serialize;
use serde_yaml::Value;
use std::collections::BTreeMap;

pub const DEFAULT_TIMEOUT_SECONDS: u64 = 30;
pub const MAX_TIMEOUT_SECONDS: u64 = 120;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Scalar {
    Bool(bool),
    Number(f64),
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Trigger {
    pub property: String,
    pub to: Vec<Option<Scalar>>,
    pub from: Vec<Option<Scalar>>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Action {
    Set {
        values: BTreeMap<String, Scalar>,
    },
    Remove {
        keys: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    Run {
        argv: Vec<String>,
        timeout_seconds: u64,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct Definition {
    pub name: String,
    pub on: Trigger,
    pub when: Option<FilterGroup>,
    pub actions: Vec<Action>,
}

fn scalar(value: &Value) -> Result<Option<Scalar>, String> {
    match value {
        Value::Null => Ok(None),
        Value::Bool(b) => Ok(Some(Scalar::Bool(*b))),
        Value::Number(n) => Ok(n.as_f64().map(Scalar::Number)),
        Value::String(s) => Ok(Some(Scalar::Text(s.clone()))),
        _ => Err("values must be text, numbers, booleans or null".to_string()),
    }
}

fn scalar_list(value: Option<&Value>) -> Result<Vec<Option<Scalar>>, String> {
    match value {
        None => Ok(Vec::new()),
        Some(Value::Sequence(items)) => items.iter().map(scalar).collect(),
        Some(single) => Ok(vec![scalar(single)?]),
    }
}

fn text(value: &Value, what: &str) -> Result<String, String> {
    match value {
        Value::String(s) if !s.trim().is_empty() => Ok(s.clone()),
        _ => Err(format!("{what} must be a non-empty string")),
    }
}

fn parse_trigger(root: &Value) -> Result<Trigger, String> {
    let on = root.get("on").ok_or("missing `on`")?;
    let property = text(
        on.get("property").ok_or("`on` needs a `property`")?,
        "`on.property`",
    )?;
    Ok(Trigger {
        property,
        to: scalar_list(on.get("to"))?,
        from: scalar_list(on.get("from"))?,
    })
}

fn parse_set(values: &Value) -> Result<Action, String> {
    let map = values.as_mapping().ok_or("`set` must be a mapping")?;
    let mut out = BTreeMap::new();
    for (key, value) in map {
        let key = text(key, "a `set` key")?;
        let value = scalar(value)?.ok_or("`set` values cannot be null; use `remove`")?;
        out.insert(key, value);
    }
    Ok(Action::Set { values: out })
}

fn parse_remove(keys: &Value) -> Result<Action, String> {
    let keys = match keys {
        Value::Sequence(items) => items
            .iter()
            .map(|item| text(item, "a `remove` key"))
            .collect::<Result<Vec<_>, _>>()?,
        single => vec![text(single, "a `remove` key")?],
    };
    Ok(Action::Remove { keys })
}

fn parse_run(action: &Value) -> Result<Action, String> {
    let argv = action
        .get("run")
        .and_then(Value::as_sequence)
        .ok_or("`run` must be a list: the program, then its arguments")?
        .iter()
        .map(|part| match part {
            Value::String(s) => Ok(s.clone()),
            Value::Number(n) => Ok(n.to_string()),
            _ => Err("`run` arguments must be text".to_string()),
        })
        .collect::<Result<Vec<_>, _>>()?;
    let program = argv.first().ok_or("`run` needs a program")?;
    if !program.starts_with('/') && !is_windows_absolute(program) {
        return Err(format!(
            "`run` must start with an absolute path, not `{program}`"
        ));
    }
    if program.contains("{{") {
        return Err("the program in `run` cannot contain templates".to_string());
    }
    let timeout = match action.get("timeout") {
        None => DEFAULT_TIMEOUT_SECONDS,
        Some(value) => value
            .as_u64()
            .filter(|seconds| (1..=MAX_TIMEOUT_SECONDS).contains(seconds))
            .ok_or_else(|| format!("`timeout` must be 1 to {MAX_TIMEOUT_SECONDS} seconds"))?,
    };
    Ok(Action::Run {
        argv,
        timeout_seconds: timeout,
    })
}

fn is_windows_absolute(program: &str) -> bool {
    let bytes = program.as_bytes();
    bytes.len() > 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
}

fn parse_action(action: &Value) -> Result<Action, String> {
    if let Some(values) = action.get("set") {
        return parse_set(values);
    }
    if let Some(keys) = action.get("remove") {
        return parse_remove(keys);
    }
    if action.get("run").is_some() {
        return parse_run(action);
    }
    Err("each action needs `set`, `remove` or `run`".to_string())
}

pub fn parse_definition(content: &str) -> Result<Definition, String> {
    let root: Value = serde_yaml::from_str(content).map_err(|e| format!("invalid YAML: {e}"))?;
    let name = text(root.get("name").ok_or("missing `name`")?, "`name`")?;
    let on = parse_trigger(&root)?;
    let when = match root.get("when") {
        None | Some(Value::Null) => None,
        Some(filters) => Some(
            serde_yaml::from_value::<FilterGroup>(filters.clone())
                .map_err(|e| format!("invalid `when`: {e}"))?,
        ),
    };
    let actions = root
        .get("do")
        .and_then(Value::as_sequence)
        .ok_or("`do` must be a list of actions")?
        .iter()
        .map(parse_action)
        .collect::<Result<Vec<_>, _>>()?;
    if actions.is_empty() {
        return Err("`do` needs at least one action".to_string());
    }
    Ok(Definition {
        name,
        on,
        when,
        actions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FULL: &str = r#"
name: Finish task
on: { property: status, to: done, from: [doing, null] }
when: { all: [ { field: type, op: equals, value: Task } ] }
do:
  - set: { completed: "{{today}}", size: 3, flagged: true }
  - remove: waiting_on
  - run: [/usr/bin/python3, -I, x.py, 7]
    timeout: 20
"#;

    #[test]
    fn parses_trigger_filter_and_actions() {
        let def = parse_definition(FULL).unwrap();
        assert_eq!(def.name, "Finish task");
        assert_eq!(def.on.property, "status");
        assert_eq!(def.on.to, vec![Some(Scalar::Text("done".into()))]);
        assert_eq!(def.on.from, vec![Some(Scalar::Text("doing".into())), None]);
        assert!(def.when.is_some());
        assert_eq!(def.actions.len(), 3);
        assert!(matches!(&def.actions[1], Action::Remove { keys } if keys == &["waiting_on"]));
        assert_eq!(
            def.actions[2],
            Action::Run {
                argv: vec![
                    "/usr/bin/python3".into(),
                    "-I".into(),
                    "x.py".into(),
                    "7".into()
                ],
                timeout_seconds: 20
            }
        );
    }

    #[test]
    fn serializes_for_the_renderer() {
        let json = serde_json::to_value(parse_definition(FULL).unwrap()).unwrap();
        assert_eq!(json["on"]["to"][0], "done");
        assert_eq!(json["on"]["from"][1], serde_json::Value::Null);
        assert_eq!(json["actions"][0]["kind"], "set");
        assert_eq!(json["actions"][0]["values"]["size"], 3.0);
        assert_eq!(json["actions"][2]["timeoutSeconds"], 20);
        assert_eq!(json["when"]["all"][0]["field"], "type");
    }

    #[test]
    fn defaults_the_timeout_and_allows_a_missing_filter() {
        let def =
            parse_definition("name: x\non: { property: status }\ndo:\n  - run: [/bin/true]\n")
                .unwrap();
        assert!(def.when.is_none());
        assert!(def.on.to.is_empty());
        assert!(matches!(
            &def.actions[0],
            Action::Run {
                timeout_seconds: 30,
                ..
            }
        ));
    }

    #[test]
    fn rejects_malformed_automations_with_a_reason() {
        let cases = [
            ("name: x\ndo: []\n", "missing `on`"),
            (
                "on: { property: s }\ndo: [ { set: { a: 1 } } ]\n",
                "missing `name`",
            ),
            ("name: x\non: { property: s }\n", "`do` must be a list"),
            (
                "name: x\non: { property: s }\ndo: []\n",
                "at least one action",
            ),
            (
                "name: x\non: { property: s }\ndo: [ { nope: 1 } ]\n",
                "needs `set`",
            ),
            (
                "name: x\non: { property: s }\ndo: [ { run: [python3, x.py] } ]\n",
                "absolute path",
            ),
            (
                "name: x\non: { property: s }\ndo: [ { run: ['/bin/{{x}}'] } ]\n",
                "templates",
            ),
            (
                "name: x\non: { property: s }\ndo: [ { run: [/bin/true], timeout: 500 } ]\n",
                "`timeout`",
            ),
            (
                "name: x\non: { property: s }\ndo: [ { set: { a: null } } ]\n",
                "cannot be null",
            ),
            (
                "name: x\non: { property: s }\ndo: [ { run: /bin/true } ]\n",
                "must be a list",
            ),
            ("name: [", "invalid YAML"),
        ];
        for (content, expected) in cases {
            let error = parse_definition(content).unwrap_err();
            assert!(error.contains(expected), "{content:?} gave {error:?}");
        }
    }
}
