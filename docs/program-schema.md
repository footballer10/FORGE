# Forge program proposal format (schemaVersion 1)

Claude proposes a training program as one JSON object. The Forge app (Settings → Claude) validates it, shows what would change, and saves
nothing until you approve. The code that enforces this is `src/domain/programProposal.ts`.

## Rules

- Output one JSON object only (a ```json fence is fine). No comments, no trailing commas.
- `exercise` is matched by name or alias against your exercise library, ignoring case. A name that does not match blocks
  the proposal; add or rename the exercise in the library first.
- Weights are numbers in the unit given on the set (`unit`), else your profile unit. Dumbbell weights are per dumbbell.
- `reason` is required and is saved as the change reason of the new program version.
- Unknown fields are errors, so typos are caught.
- Limits: 52 weeks, 7 sessions per week, 20 exercises per session, 30 sets per `count`.

## Fields

| Path | Type | Notes |
|---|---|---|
| `schemaVersion` | `1` | required |
| `name` | text | required |
| `description` | text | optional |
| `reason` | text | required: why this change |
| `daysPerWeek` | whole number 1-7 | optional |
| `weeks[]` | list, at least 1 | order = week number |
| `weeks[].phase` | `offseason` `preseason` `inseason` `hypertrophy` `strength` `power` `deload` `testing` | optional |
| `weeks[].deload` | true/false | optional |
| `weeks[].notes` | text | optional |
| `weeks[].sessions[]` | list, at least 1 | order = day number |
| `...sessions[].name` | text | required |
| `...sessions[].notes` | text | optional |
| `...sessions[].exercises[]` | list, at least 1 | order = exercise order |
| `...exercises[].exercise` | text | required, library name or alias |
| `...exercises[].sets[]` | list, at least 1 | |
| `...exercises[].restSec` | whole number 0-1800 | optional override of the default rest |
| `...exercises[].notes` | text | optional |
| `...exercises[].superset` | text | optional; same label on consecutive exercises links them |
| `...exercises[].progression` | object | optional, see below |
| `sets[].type` | `warmup` `working` `drop` `failure` `amrap` | default `working` |
| `sets[].count` | whole number 1-30 | repeat this set N times, default 1 |
| `sets[].reps` / `repsMax` | whole numbers | `repsMax` (a range) needs `reps` and must be at least `reps` |
| `sets[].weight` | number >= 0 | with optional `unit` (`lb` or `kg`); not together with `percentE1rm` |
| `sets[].percentE1rm` | 0.1-1.2 | fraction of current e1RM, 0.75 = 75% |
| `sets[].rpe` | 1-10 | optional |
| `sets[].durationSec`, `distanceM` | whole seconds, metres | for time/distance work |

A set needs `reps`, `durationSec` or `distanceM`.

Progression (all optional; the app only suggests, you can always override):

- `{ "kind": "none" }`
- `{ "kind": "doubleProgression", "repsMin": 6, "repsMax": 8 }`
- `{ "kind": "percentE1rm", "percent": 0.8 }`
- `{ "kind": "rpeTarget", "rpe": 8 }`

## Example

```json
{
  "schemaVersion": 1,
  "name": "Preseason strength block",
  "reason": "Squat e1RM has stalled for 6 weeks; add a second squat day and cut accessory volume.",
  "daysPerWeek": 3,
  "weeks": [
    {
      "phase": "preseason",
      "sessions": [
        {
          "name": "Lower A",
          "exercises": [
            {
              "exercise": "Barbell Squat",
              "restSec": 180,
              "sets": [
                { "type": "warmup", "reps": 5, "weight": 135 },
                { "count": 4, "reps": 5, "weight": 225, "rpe": 8 }
              ]
            },
            {
              "exercise": "Pull-up",
              "sets": [{ "count": 3, "reps": 6, "repsMax": 8 }],
              "progression": { "kind": "doubleProgression", "repsMin": 6, "repsMax": 8 }
            }
          ]
        }
      ]
    }
  ]
}
```

## JSON Schema (draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "name", "reason", "weeks"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "name": { "type": "string", "minLength": 1 },
    "description": { "type": "string", "minLength": 1 },
    "reason": { "type": "string", "minLength": 1 },
    "daysPerWeek": { "type": "integer", "minimum": 1, "maximum": 7 },
    "weeks": {
      "type": "array", "minItems": 1, "maxItems": 52,
      "items": {
        "type": "object", "additionalProperties": false, "required": ["sessions"],
        "properties": {
          "phase": { "enum": ["offseason", "preseason", "inseason", "hypertrophy", "strength", "power", "deload", "testing"] },
          "deload": { "type": "boolean" },
          "notes": { "type": "string", "minLength": 1 },
          "sessions": {
            "type": "array", "minItems": 1, "maxItems": 7,
            "items": {
              "type": "object", "additionalProperties": false, "required": ["name", "exercises"],
              "properties": {
                "name": { "type": "string", "minLength": 1 },
                "notes": { "type": "string", "minLength": 1 },
                "exercises": {
                  "type": "array", "minItems": 1, "maxItems": 20,
                  "items": {
                    "type": "object", "additionalProperties": false, "required": ["exercise", "sets"],
                    "properties": {
                      "exercise": { "type": "string", "minLength": 1 },
                      "restSec": { "type": "integer", "minimum": 0, "maximum": 1800 },
                      "notes": { "type": "string", "minLength": 1 },
                      "superset": { "type": "string", "minLength": 1 },
                      "progression": {
                        "oneOf": [
                          { "type": "object", "required": ["kind"], "properties": { "kind": { "const": "none" } }, "additionalProperties": false },
                          { "type": "object", "required": ["kind", "repsMin", "repsMax"], "properties": { "kind": { "const": "doubleProgression" }, "repsMin": { "type": "number", "minimum": 1, "maximum": 100 }, "repsMax": { "type": "number", "minimum": 1, "maximum": 100 } }, "additionalProperties": false },
                          { "type": "object", "required": ["kind", "percent"], "properties": { "kind": { "const": "percentE1rm" }, "percent": { "type": "number", "minimum": 0.1, "maximum": 1.2 } }, "additionalProperties": false },
                          { "type": "object", "required": ["kind", "rpe"], "properties": { "kind": { "const": "rpeTarget" }, "rpe": { "type": "number", "minimum": 1, "maximum": 10 } }, "additionalProperties": false }
                        ]
                      },
                      "sets": {
                        "type": "array", "minItems": 1,
                        "items": {
                          "type": "object", "additionalProperties": false,
                          "properties": {
                            "type": { "enum": ["warmup", "working", "drop", "failure", "amrap"] },
                            "count": { "type": "integer", "minimum": 1, "maximum": 30 },
                            "reps": { "type": "integer", "minimum": 1, "maximum": 200 },
                            "repsMax": { "type": "integer", "minimum": 1, "maximum": 200 },
                            "weight": { "type": "number", "minimum": 0, "maximum": 5000 },
                            "unit": { "enum": ["lb", "kg"] },
                            "percentE1rm": { "type": "number", "minimum": 0.1, "maximum": 1.2 },
                            "rpe": { "type": "number", "minimum": 1, "maximum": 10 },
                            "durationSec": { "type": "integer", "minimum": 1, "maximum": 36000 },
                            "distanceM": { "type": "number", "minimum": 1, "maximum": 200000 }
                          },
                          "anyOf": [{ "required": ["reps"] }, { "required": ["durationSec"] }, { "required": ["distanceM"] }]
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

The JSON Schema describes the shape; the app's validator also checks the cross-field rules (`repsMax` needs `reps`,
`weight` and `percentE1rm` are exclusive). The same format text is built into the app (Settings → Claude, "Copy format for Claude").
