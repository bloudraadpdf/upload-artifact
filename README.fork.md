# Upload action response repair

Base: upstream `v3.2.1`, commit `ff15f0306b3f739f7b6fd43fb5d26cd321bd4de5`.
The `external/toolkit` submodule pins the artifact 1.1.2 source patch.
The retry helper reads failed HTTP bodies. Successful bodies remain available
to callers. Protocol, retry policy and HTTP client version remain unchanged.
Truncated failed bodies enter the existing transport-error retry path.

Install the pinned tools with `mise install`. Rebuild from a clean clone:

```sh
mise exec -- just configure
mise exec -- just build
mise exec -- just check
mise exec -- just release
```

`configure` initialises the submodule and installs the root npm lock.
`build` compiles the artifact package from source before the action.
`release` regenerates `dist/index.js`; commit the generated bundle with the
source and dependency pins. CI runs the bundle and does not initialise
the submodule or download runtime dependencies.

The artifact dependency uses a local file link to the submodule package.
All package versions from the action's original npm lock are retained.
The build adds only `@types/tmp` 0.2.3, the artifact package's locked type
dependency. The root lock is the sole install authority for the action build.

Before publication, create `external/toolkit` and `external/upload-artifact`
on Forgejo and their GitHub backups, push both reviewed patch branches,
register the forks and Boomslang consumer, and check a fresh recursive clone.
The toolkit submodule URL requires Forgejo SSH read access for maintainers.
Boomslang must pin the reviewed action commit only after both repositories
are published. Concurrent upload qualification needs the Forgejo server repair.
