/**
 * The registration surface a MakeCode extension declares Wendoo vocabulary
 * through, and the drain that moves what it collected into the registries a
 * brain runtime resolves against.
 *
 * An extension registers from its own top-level code, which runs at program
 * start, before anything constructs a runtime. Registrations are keyed by
 * name and carry no ids; the drain gives each name the id the project's
 * mapping records for it, and closes registration.
 *
 * Nothing in registration is fatal. A registration that cannot be honoured is
 * ignored and recorded in {@link registrationDiagnostics}, and the program
 * runs on.
 */
namespace wendoo {
  /** Diagnostic code: two registrations claimed one name; the earlier one stands and the later is ignored. */
  export const REGISTRATION_DUPLICATE_NAME = "registration-duplicate-name";

  /** Diagnostic code: a registration arrived after the registries were populated, and was ignored. */
  export const REGISTRATION_AFTER_SNAPSHOT = "registration-after-snapshot";

  /** Diagnostic code: the mapping records no id for a registered name, which is therefore left unbound. */
  export const REGISTRATION_UNMAPPED_NAME = "registration-unmapped-name";

  /**
   * Diagnostic code: a type reads its fields through a field getter and
   * declares them writable, but registers no field setter, so a brain's write
   * lands in the value's own field slots, which the getter never reads.
   */
  export const REGISTRATION_FIELD_WRITES_UNBOUND = "registration-field-writes-unbound";

  /**
   * The TypeId a struct value of the type named `name` carries.
   *
   * @param name - Wendoo type name, as the type is registered.
   */
  export function structTypeId(name: string): string {
    return `struct:<${name}>`;
  }

  /**
   * The mapping key of one field of one struct type.
   *
   * @param typeName - Wendoo type name, as the type is registered.
   * @param fieldName - Field name, as the type declares it.
   */
  export function structFieldKey(typeName: string, fieldName: string): string {
    return `${typeName}.${fieldName}`;
  }

  /**
   * One registration problem. Diagnostics carry machine-readable fields only:
   * a stable {@link RegistrationDiagnostic.code} and the names the problem is
   * about.
   */
  export class RegistrationDiagnostic {
    /** Stable code of the problem. */
    code: string;
    /** Registration name the problem is about. */
    name: string;
    /** Pack whose registration the problem is reported against. */
    pack: string;
    /** Pack holding the registration that stands, or `""` when the code names no second registration. */
    otherPack: string;

    constructor(code: string, name: string, pack: string, otherPack: string) {
      this.code = code;
      this.name = name;
      this.pack = pack;
      this.otherPack = otherPack;
    }
  }

  /**
   * The name-to-id mapping the drain applies: one id per registered name,
   * over every kind of registration and over struct fields, whose keys come
   * from {@link structFieldKey}. Build it from the project's committed
   * mapping before draining.
   */
  export class RegistrationIdMap {
    private names: string[] = [];
    private ids: number[] = [];

    constructor() {}

    /**
     * Record `id` for `name`. A name recorded twice keeps the id it was first
     * recorded with.
     *
     * @param name - Registration name or struct-field key.
     * @param id - Id the drain assigns registrations of that name.
     */
    add(name: string, id: number): void {
      this.names.push(name);
      this.ids.push(id);
    }

    /**
     * The id recorded for `name`, or {@link UNASSIGNED_ID} when none is.
     *
     * @param name - Registration name or struct-field key.
     */
    idOf(name: string): number {
      for (let i = 0; i < this.names.length; i++) {
        if (this.names[i] === name) {
          return this.ids[i];
        }
      }
      return UNASSIGNED_ID;
    }
  }

  /** The registries one drain populates, and the mapping it resolves ids through. */
  class DrainTarget {
    ids: RegistrationIdMap;
    functions: HostFunctionRegistry;
    actions: HostActionRegistry;
    types: StructTypeRegistry;

    constructor(
      ids: RegistrationIdMap,
      functions: HostFunctionRegistry,
      actions: HostActionRegistry,
      types: StructTypeRegistry
    ) {
      this.ids = ids;
      this.functions = functions;
      this.actions = actions;
      this.types = types;
    }
  }

  /**
   * One registration waiting for the drain. Subclass and override
   * {@link PendingRegistration.install} to place it in its registry.
   */
  class PendingRegistration {
    /** Name the registration claims. */
    name: string;
    /** Pack that made the registration. */
    pack: string;

    constructor(name: string, pack: string) {
      this.name = name;
      this.pack = pack;
    }

    /**
     * Place the registration in its registry under `id`. The base
     * implementation registers nothing.
     *
     * @param id - Id the mapping records for {@link PendingRegistration.name}.
     * @param target - Registries being populated, and the mapping.
     */
    install(id: number, target: DrainTarget): void {}

    /**
     * Stable code of the problem this registration carries although it is
     * honoured, or `""` when it carries none. The base implementation carries
     * none.
     */
    warningCode(): string {
      return "";
    }
  }

  /** A struct type waiting for its type-atom id and its field ids. */
  class PendingStructType extends PendingRegistration {
    private fieldNames: string[];
    private binding: StructTypeBinding;

    constructor(name: string, pack: string, fieldNames: string[], binding: StructTypeBinding) {
      super(name, pack);
      this.fieldNames = fieldNames;
      this.binding = binding;
    }

    install(id: number, target: DrainTarget): void {
      const fieldIds: number[] = [];
      for (let i = 0; i < this.fieldNames.length; i++) {
        const key = structFieldKey(this.name, this.fieldNames[i]);
        const fieldId = target.ids.idOf(key);
        if (fieldId === UNASSIGNED_ID) {
          diagnose(REGISTRATION_UNMAPPED_NAME, key, this.pack, "");
        }
        fieldIds.push(fieldId);
      }
      target.types.register(structTypeId(this.name), id, fieldIds, this.binding);
    }

    warningCode(): string {
      const writesUnbound =
        this.binding.hasFieldGetter && !this.binding.hasFieldSetter && !this.binding.fieldsAreReadOnly;
      return writesUnbound ? REGISTRATION_FIELD_WRITES_UNBOUND : "";
    }
  }

  /** A sensor or actuator waiting for its action id. */
  class PendingHostAction extends PendingRegistration {
    private binding: HostActionBinding;

    constructor(name: string, pack: string, binding: HostActionBinding) {
      super(name, pack);
      this.binding = binding;
    }

    install(id: number, target: DrainTarget): void {
      target.actions.register(id, this.name, this.binding);
    }
  }

  /** An operator's implementing host function, waiting for its funcId. */
  class PendingHostFunction extends PendingRegistration {
    private fn: HostFunction;

    constructor(name: string, pack: string, fn: HostFunction) {
      super(name, pack);
      this.fn = fn;
    }

    install(id: number, target: DrainTarget): void {
      target.functions.register(id, this.fn);
    }
  }

  /** Registrations made since program start, in the order they were made. */
  const pendingRegistrations: PendingRegistration[] = [];

  /** Registration problems recorded since program start, in the order they were found. */
  const recordedDiagnostics: RegistrationDiagnostic[] = [];

  /** Whether a drain has taken the registry snapshot, after which registration is closed. */
  let registrationClosed: boolean = false;

  function diagnose(code: string, name: string, pack: string, otherPack: string): void {
    recordedDiagnostics.push(new RegistrationDiagnostic(code, name, pack, otherPack));
  }

  function appendPending(entry: PendingRegistration): void {
    if (registrationClosed) {
      diagnose(REGISTRATION_AFTER_SNAPSHOT, entry.name, entry.pack, "");
      return;
    }
    pendingRegistrations.push(entry);
  }

  /**
   * The registration handle one extension registers its vocabulary through.
   * Obtain it with {@link pack} in the extension's top-level code; every call
   * on it appends to the pending set a drain later moves into the registries.
   */
  export class Pack {
    /** Name the registration diagnostics report this pack by. */
    name: string;

    constructor(name: string) {
      this.name = name;
    }

    /**
     * Register the struct type `name`, whose fields are `fieldNames` in
     * declaration order. The drain resolves the type's atom id from the
     * mapping, resolves each field's id through {@link structFieldKey}, and
     * gives `binding` the TypeId {@link structTypeId} derives from `name`.
     *
     * @param name - Wendoo type name; struct values of the type carry the TypeId derived from it.
     * @param fieldNames - Field names in declaration order; the binding's `fieldIds` follow this order.
     * @param binding - Type binding carrying the type's hooks.
     */
    defineStruct(name: string, fieldNames: string[], binding: StructTypeBinding): void {
      appendPending(new PendingStructType(name, this.name, fieldNames, binding));
    }

    /**
     * Register the sensor or actuator `name`. The drain resolves its action
     * id from the mapping and gives `binding` both the id and the name.
     *
     * @param name - Tile name; the mapping records the action id under it.
     * @param binding - Action binding carrying the tile's body.
     */
    bind(name: string, binding: HostActionBinding): void {
      appendPending(new PendingHostAction(name, this.name, binding));
    }

    /**
     * Register the host function implementing the operator `name`. The drain
     * resolves its funcId from the mapping and gives `fn` the id.
     *
     * @param name - Operator name; the mapping records the funcId under it.
     * @param fn - Host function computing the operator.
     */
    bindOperator(name: string, fn: HostFunction): void {
      appendPending(new PendingHostFunction(name, this.name, fn));
    }
  }

  /**
   * Begin registering the vocabulary of the pack `name`. Call it from an
   * extension's top-level code; registrations made through the returned
   * handle are honoured until a drain closes registration.
   *
   * @param name - Pack name; registration diagnostics report the pack by it.
   */
  export function pack(name: string): Pack {
    return new Pack(name);
  }

  /**
   * Move every pending registration into `functions`, `actions` and `types`,
   * giving each the id `ids` records for its name, and close registration so
   * that a later one is ignored with a diagnostic.
   *
   * Call it once while constructing the brain runtime, before decoding any
   * program: decoding validates every type atom a program names against
   * `types`.
   *
   * Two registrations claiming one name resolve first-wins: the earlier one
   * is installed, the later one is ignored, and the diagnostic names both
   * packs. A name the mapping records no id for is left unbound.
   *
   * @param ids - Name-to-id mapping, from the project's committed mapping.
   * @param functions - Host-function registry the program's `HOST_CALL` operands resolve against.
   * @param actions - Host-action registry the program's `HOST_ACTION_CALL` operands resolve against.
   * @param types - Struct type registry the program's type atoms and field hooks resolve against.
   */
  export function applyPendingRegistrations(
    ids: RegistrationIdMap,
    functions: HostFunctionRegistry,
    actions: HostActionRegistry,
    types: StructTypeRegistry
  ): void {
    const target = new DrainTarget(ids, functions, actions, types);
    const claimedNames: string[] = [];
    const claimedBy: string[] = [];
    for (let i = 0; i < pendingRegistrations.length; i++) {
      const entry = pendingRegistrations[i];
      const claimed = claimedNames.indexOf(entry.name);
      if (claimed >= 0) {
        diagnose(REGISTRATION_DUPLICATE_NAME, entry.name, entry.pack, claimedBy[claimed]);
        continue;
      }
      const id = ids.idOf(entry.name);
      if (id === UNASSIGNED_ID) {
        diagnose(REGISTRATION_UNMAPPED_NAME, entry.name, entry.pack, "");
        continue;
      }
      const warning = entry.warningCode();
      if (warning.length > 0) {
        diagnose(warning, entry.name, entry.pack, "");
      }
      entry.install(id, target);
      claimedNames.push(entry.name);
      claimedBy.push(entry.pack);
    }
    registrationClosed = true;
  }

  /**
   * Every registration problem recorded since program start, in the order it
   * was found. The host surfaces them; the registries are usable whatever
   * they say.
   */
  export function registrationDiagnostics(): RegistrationDiagnostic[] {
    return recordedDiagnostics;
  }
}
