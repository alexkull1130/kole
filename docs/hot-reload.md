# Lifecycle-safe hot reload

Kole uses deliberate replacement as its first hot-reload policy. Calling `kole_domain_replace` closes the old lifecycle domain before returning a fresh one. This cancels the old domain's event subscriptions and background tasks, preventing an old script version from observing or mutating the new version.

The host owns any migration decision. It may read compatible state before replacement and supply it to the new program, but it must never move live callbacks, task handles, or native resource handles across domains. Those are lifecycle-bound and always end with the old domain.

This policy favors predictable cleanup over invisible state retention. A later compatibility protocol can add automatic state migration without weakening the replacement boundary.
