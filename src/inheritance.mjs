export function linkInheritance(runtime) {
  const visiting = new Set(), linked = new Set();
  const link = cls => {
    if (linked.has(cls)) return;
    if (visiting.has(cls)) runtime.fail(cls.declaration, 'Inheritance cycle');
    visiting.add(cls);
    cls.ownFields = new Map(cls.fields); cls.ownMethods = new Map(cls.methods);
    cls.isAbstract = !!cls.declaration.isAbstract;
    for (const member of [...cls.fields.values(), ...cls.methods.values(), ...[...cls.enums.values()].map(e => e.declaration)]) Object.defineProperty(member, 'owner', { value: cls, configurable: true });
    if (cls.declaration.parent) {
      const parent = runtime.classes.get(cls.declaration.parent);
      if (!parent || parent.kind !== 'class') runtime.fail(cls.declaration, 'extends requires a class');
      link(parent); cls.parent = parent;
      for (const [name, field] of parent.fields) {
        if (cls.fields.has(name) || cls.methods.has(name) || cls.enums.has(name)) runtime.fail(cls.declaration, `Inherited field '${name}' cannot be shadowed`);
      }
      for (const [name, enumeration] of parent.enums) {
        if (cls.fields.has(name) || cls.methods.has(name) || cls.enums.has(name)) runtime.fail(cls.declaration, `Inherited enum '${name}' cannot be shadowed`);
        cls.enums.set(name, enumeration);
      }
      cls.fields = new Map([...parent.fields, ...cls.fields]);
      for (const [name, method] of parent.methods) {
        if (method.constructor) continue;
        if (cls.fields.has(name) || cls.enums.has(name)) runtime.fail(cls.declaration, `Inherited method '${name}' conflicts with a member`);
        const override = cls.methods.get(name);
        if (override) {
          if (!override.isOverride) runtime.fail(override, `Method '${name}' replaces a parent method; add override`);
          if (method.access === 'private' || method.isStatic || override.isStatic || override.constructor) runtime.fail(override, 'Only accessible instance methods can be overridden');
          if (override.access !== method.access || override.type !== method.type || override.params.length !== method.params.length || override.params.some((p,i)=>p.type !== method.params[i].type) || override.from !== method.from || override.to !== method.to)
            runtime.fail(override, `Override '${name}' must match its parent signature and lifecycle clauses exactly`);
        } else cls.methods.set(name, method);
      }
      if (cls.lifecycle && parent.lifecycle) runtime.fail(cls.lifecycle, 'A subclass cannot redeclare inherited lifecycle state');
      cls.lifecycle ??= parent.lifecycle;
      for (const name of parent.interfaces) cls.interfaces.add(name);
    }
    for (const method of cls.ownMethods.values()) {
      if (method.isOverride && !cls.parent?.methods.has(method.name)) runtime.fail(method, `override '${method.name}' has no parent method`);
    }
    if (!cls.isAbstract && cls.kind !== 'interface') for (const method of cls.methods.values()) {
      if (method.isAbstract) runtime.fail(cls.declaration, `Concrete class '${cls.name}' must implement abstract method '${method.name}'`);
    }
    visiting.delete(cls); linked.add(cls);
  };
  for (const cls of runtime.classes.values()) link(cls);
}

export function isSubtype(cls, name) {
  for (let current = cls; current; current = current.parent) if (current.name === name || current.interfaces.has(name)) return true;
  return false;
}
