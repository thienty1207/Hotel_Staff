# Baron / Graphify Compatibility Issue

**Status:** Open — documented for diagnosis; not resolved and not a closure
record.

**Related SPEC:**
[`SPEC-08.3`](../../Context-Spec-Hotel-Staff/Spec/SPEC-08.3-baron-graphify-toolchain-integrity-repair.md)

**Last verified:** 2026-09-19

## Summary

The current application is not the source of this problem. The remaining issue
is an integration-contract mismatch between the installed Baron code-map flow
and the official Graphify CLI:

- Baron: `5.0.0`
- Graphify package: `graphifyy 0.9.25`
- Graphify executable: `C:\Users\Ty\.local\bin\graphify.exe`
- Graphify installation source: `uv` tool installation

Baron can discover the executable, but its native code-map refresh/query flow
expects a different output-path and query-output contract from the one exposed
by Graphify `0.9.25`.

This does not affect Hotel Staff runtime behavior, PostgreSQL data, migrations,
authentication, frontend code, or backend product behavior.

## What Baron expects

The observed Baron refresh invocation is conceptually:

```text
graphify extract <repository> --code-only --out <staging>\graphify-out --no-cluster
```

The Baron query flow also passes a graph path and requests JSON-shaped query
evidence, conceptually:

```text
graphify query "<question>" --graph <graph.json> --json --budget <n>
```

The exact staging directory is generated per run and must not be hard-coded.

## What Graphify `0.9.25` does

Graphify `0.9.25` uses this output convention:

```text
<out>\graphify-out\graph.json
```

When Baron already passes a path ending in `graphify-out`, the result is nested
under another `graphify-out` directory. Baron then cannot inspect the graph at
the location it expects.

For the query command, Graphify `0.9.25` implements the normal CLI query as a
human-readable traversal. The command does not produce the JSON `results`
object that Baron attempts to parse. Passing `--json` to this query command does
not change that output contract.

## Verified evidence

Capability discovery succeeds when the official executable is available on the
process `PATH`:

```text
provider: graphify-local
presence: present
compatible: true
resolved on PATH: C:\Users\Ty\.local\bin\graphify.exe
```

The runtime check also reports the provider as present, compatible, and safe.
It correctly does not claim execution proof without a current Baron-owned
receipt.

For diagnosis only, a process-scoped official Graphify setting was tested:

```powershell
$env:GRAPHIFY_OUT = '.'
baron automation code-map refresh --json
```

Result: refresh exited successfully and returned Graphify `0.9.25` evidence.
The same process-scoped test then produced:

```text
error: Graphify query returned malformed JSON; Survey fallback remains active
```

Therefore the environment setting demonstrates the output-path mismatch, but
it does not solve the query-format mismatch and is not a durable project fix.

## Root cause classification

This is best classified as a **Baron/Graphify compatibility-contract defect**,
not as a standalone application bug:

1. Baron `5.0.0` invokes Graphify with an output-path assumption that differs
   from Graphify `0.9.25` behavior.
2. Baron expects structured JSON query results that Graphify `0.9.25` does not
   emit from its CLI `query` command.

It is therefore reasonable to describe the immediate failure as being on the
Baron integration side when Graphify `0.9.25` is the supported native tool. The
final repair must still confirm which Baron/Graphify version pairing is
officially supported before assigning blame to one release alone.

## Current impact

- Baron capability discovery: healthy when the official executable is on PATH.
- Baron runtime safety check: passes, but no task-specific execution evidence.
- Native code-map refresh: fails with the default output contract; passes only
  in the diagnostic process-scoped output configuration.
- Native code-map query: fails because Baron receives non-JSON output.
- Managed `STACK_MAP.md`: must not be manually edited to hide this problem.
- Baron operation-bound completion: not completed because no trusted current
  receipt was produced.
- SPEC-08.3: remains `OPEN / NOT CLOSED`.

## Correct resolution path

Use the smallest supported root fix in this order:

1. A supported Baron version compatible with Graphify `0.9.25`.
2. A supported Graphify version compatible with Baron `5.0.0`.
3. An official Baron provider-adapter mechanism, if the installed Baron
   distribution supports one.
4. A durable adapter only if Baron officially supports custom CLI providers and
   the complete adapter requirements in SPEC-08.3 are proven.

After the root fix, all of the following must pass without a temporary shim:

```text
baron capability check --adapter codex
baron automation code-map refresh
baron automation code-map query "backend HTTP entrypoint"
```

The final operation must also produce a real Baron-owned operation-bound
receipt, pass required gates and trace scoring, complete the active plan, and
leave no active Graphify/recovery blocker.

## Prohibited workarounds

Do not:

- replace `graphify.exe` with a fake executable;
- put a disposable wrapper earlier on `PATH`;
- manually transform or fake Graphify JSON;
- patch generated Baron state or type a fake receipt into Markdown;
- hand-edit `STACK_MAP.md` as proof of a successful refresh;
- modify Hotel Staff product code, database data, migrations, or SPEC-09 to
  bypass the tooling failure.

## Data and product safety

The diagnosis and this README do not require database writes, development seed,
ticket mutations, migration `0021`, or application changes. Existing working
tree changes must remain preserved and unrelated files must not be staged as
part of this documentation.
