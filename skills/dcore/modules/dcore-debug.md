# DCore · dcore-debug — Debug / Investigation

- **module_id:** dcore-debug
- **status:** PLANNED
- **purpose:** structured investigation of a defect
- **inputs:** a defect report/symptoms
- **outputs:** structured investigation (PLANNED)
- **permissions:** read-only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none
- **failure_behavior:** fail-closed; malformed/empty input yields a safe scaffold with (none); unknown module -> diagnostic
- **runnable:** false

## How Claude uses this module
This module is PLANNED. Do not claim it is implemented. Use an IMPLEMENTED module or produce the output manually following this contract until it ships.

## Example
(planned)

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
