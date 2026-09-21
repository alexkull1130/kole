# Kole exercises

## 1. Safe notes reader

Write a program that accepts one file path, prints each non-empty line, and prints a final count. Use `File.open` and `using`.

## 2. Resource owner

Create a `Project` class with two `Closeable` resources. Make `close()` idempotent and close them in reverse acquisition order.

## 3. Failed work

Inside a `using` block, throw an `Error` after reading one line. Catch it outside the block. Explain why the file still closes.

## 4. Relationship design

Model a `Window` that owns an optional `Document`. Add a nullable `belongsTo` back-reference on `Document`. Try assigning that back-reference directly and use the resulting diagnostic to explain why the owner controls it.

## 5. Native-host discussion

Describe how an event subscription changes when its lifecycle domain closes. Relate this to a button handler, file watcher, or game object in another programming environment.
