/*
 * Test-only surface: `gen-selftest.js` copies this file into the generated
 * selftest project and lists it in that project's `pxt.json`, beside the
 * generated name-to-id mapping the project's `main.ts` carries.
 */

/**
 * The registration selftest: it drains what two independently written packs
 * registered at program start, and reports what the drain did.
 *
 * The two packs are ordinary pxt extensions the project depends on. Neither
 * is named by anything the selftest calls: each registers from its own
 * top-level code, so a registration found in the registries is proof that
 * pack code ran before the drain.
 *
 * The packs register three things that cannot be honoured -- a tile name both
 * packs claim, a name the mapping records no id for, and a type whose
 * writable fields have no field setter -- and the selftest registers a fourth
 * after the drain has closed registration. Every one is expected to be
 * diagnosed and survived: the run reaches its verdict line either way, and
 * that it does is what proves registration is never fatal.
 *
 * Output grammar, one line each:
 *
 * - `DIAG registration <code> <name> <pack> <otherPack>` -- one per recorded
 *   diagnostic, in the order they were found.
 * - `CHECK <check> ok` or `CHECK <check> failed`, one per check.
 * - `ASSERT <check>` -- follows each failed check; the capture harness reads
 *   it as the run's failure.
 * - `SIMCAP PASS <case>` -- the run reached its end.
 */
namespace registrationSelftest {
  /** Manifest id the capture harness brackets this run's output with. */
  export const SELFTEST_CASE_ID = "registration-selftest";

  /** Tile name both packs claim; the mapping records an id for it. */
  const CONTESTED_TILE_NAME = "sensor.beacon.reading";

  /** Tile name only the chime pack claims. */
  const CHIME_TILE_NAME = "actuator.chime.ring";

  /** Tile name the chime pack claims and the mapping records no id for. */
  const UNMAPPED_TILE_NAME = "sensor.chime.unmapped";

  /** Operator name the beacon pack claims. */
  const OPERATOR_NAME = "beacon.combine";

  /** Type name the beacon pack claims. */
  const TYPE_NAME = "Beacon";

  /** Field name of the beacon type this selftest reads through. */
  const TYPE_FIELD_NAME = "x";

  /** Tile name registered after the drain has closed registration. */
  const LATE_TILE_NAME = "actuator.chime.late";

  /** Pack name the late registration is made under. */
  const LATE_PACK_NAME = "selftest";

  /** Field id no field of the beacon type is mapped to. */
  const UNBOUND_FIELD_ID = 99;

  /** Left operand the operator check combines. */
  const OPERAND_LEFT = 2;

  /** Right operand the operator check combines. */
  const OPERAND_RIGHT = 3;

  /** Output name the action-output check writes and reads back. */
  const OUTPUT_NAME = "position";

  /** Rule the action-output check writes its output on. */
  const OUTPUT_RULE_FUNC_ID = 0;

  /** How many checks reported a failure. */
  let failedChecks = 0;

  /**
   * Report one check and, when it failed, the assertion the capture harness
   * reads as the run's failure.
   *
   * @param name - Stable name of the check.
   * @param ok - Whether the check holds.
   */
  function check(name: string, ok: boolean): void {
    console.log(`CHECK ${name} ${ok ? "ok" : "failed"}`);
    if (!ok) {
      failedChecks++;
      console.log(`ASSERT ${name}`);
    }
  }

  /** The recorded diagnostics carrying `code` about `name`. */
  function diagnosticsFor(code: string, name: string): wendoo.RegistrationDiagnostic[] {
    const found: wendoo.RegistrationDiagnostic[] = [];
    const recorded = wendoo.registrationDiagnostics();
    for (let i = 0; i < recorded.length; i++) {
      if (recorded[i].code === code && recorded[i].name === name) {
        found.push(recorded[i]);
      }
    }
    return found;
  }

  /** A context with no program behind it, for calling a binding's body directly. */
  function newContext(): wendoo.ExecutionContext {
    const services = new wendoo.BrainServices(
      new wendoo.Program(),
      new wendoo.RuleSubtreeLiveness(),
      new wendoo.BrainPageServices()
    );
    return new wendoo.ExecutionContext(services, new wendoo.VariableStore(), new wendoo.HostWorld());
  }

  /** Whether the value `value` is the number `expected`. */
  function isNumber(value: wendoo.Value, expected: number): boolean {
    return value !== undefined && value.t === wendoo.ValueTag.Number && value.num === expected;
  }

  /**
   * Both packs' own tiles reached the registries, which they can only have
   * done from top-level code that ran before the drain.
   */
  function checkPacksRegisteredBeforeDrain(ids: wendoo.RegistrationIdMap, actions: wendoo.HostActionRegistry): void {
    check("beacon-pack-registered-before-drain", actions.getById(ids.idOf(CONTESTED_TILE_NAME)) !== undefined);
    check("chime-pack-registered-before-drain", actions.getById(ids.idOf(CHIME_TILE_NAME)) !== undefined);
  }

  /**
   * One name claimed twice resolved first-wins: it was diagnosed once, the
   * diagnostic named both packs, and the registration that stands is the one
   * the diagnostic reports as standing.
   */
  function checkDuplicateNameFirstWins(ids: wendoo.RegistrationIdMap, actions: wendoo.HostActionRegistry): void {
    const reported = diagnosticsFor(wendoo.REGISTRATION_DUPLICATE_NAME, CONTESTED_TILE_NAME);
    check("duplicate-name-diagnosed-once", reported.length === 1);
    if (reported.length !== 1) {
      return;
    }
    const diagnostic = reported[0];
    check(
      "duplicate-name-diagnostic-names-both-packs",
      diagnostic.pack.length > 0 && diagnostic.otherPack.length > 0 && diagnostic.pack !== diagnostic.otherPack
    );
    const standing = actions.getById(ids.idOf(CONTESTED_TILE_NAME));
    const reading = standing === undefined ? wendoo.NIL_VALUE : standing.execSync(newContext(), []);
    check(
      "duplicate-name-earlier-registration-stands",
      reading.t === wendoo.ValueTag.String && reading.str === diagnostic.otherPack
    );
  }

  /** A name the mapping records no id for was diagnosed and left unbound. */
  function checkUnmappedNameDiagnosed(actions: wendoo.HostActionRegistry): void {
    check(
      "unmapped-name-diagnosed",
      diagnosticsFor(wendoo.REGISTRATION_UNMAPPED_NAME, UNMAPPED_TILE_NAME).length === 1
    );
    check("unmapped-name-left-unbound", actions.getById(wendoo.UNASSIGNED_ID) === undefined);
  }

  /**
   * A type whose writable fields have no field setter was warned about and
   * registered anyway, and the drain resolved its atom id and its field ids
   * from the mapping.
   */
  function checkTypeRegistration(ids: wendoo.RegistrationIdMap, types: wendoo.StructTypeRegistry): void {
    check(
      "field-writes-unbound-warned",
      diagnosticsFor(wendoo.REGISTRATION_FIELD_WRITES_UNBOUND, TYPE_NAME).length === 1
    );
    const typeId = wendoo.structTypeId(TYPE_NAME);
    const binding = types.getByTypeId(typeId);
    check("warned-type-still-registered", binding !== undefined && binding.atomId === ids.idOf(TYPE_NAME));
    if (binding === undefined) {
      return;
    }
    const ctx = newContext();
    const value = wendoo.mkNativeStruct(typeId, undefined);
    const mappedFieldId = ids.idOf(wendoo.structFieldKey(TYPE_NAME, TYPE_FIELD_NAME));
    const mappedRead = binding.fieldGetter(value, mappedFieldId, ctx);
    check("type-field-read-through-mapped-id", mappedRead !== undefined && mappedRead.t === wendoo.ValueTag.Number);
    check("type-field-read-through-unmapped-id", binding.fieldGetter(value, UNBOUND_FIELD_ID, ctx) === undefined);
  }

  /** The operator a pack registered reached the host-function registry and computes. */
  function checkOperatorRegistration(ids: wendoo.RegistrationIdMap, functions: wendoo.HostFunctionRegistry): void {
    const fn = functions.getById(ids.idOf(OPERATOR_NAME));
    check("operator-registered", fn !== undefined);
    if (fn === undefined) {
      return;
    }
    const combined = fn.exec(newContext(), [wendoo.mkNumber(OPERAND_LEFT), wendoo.mkNumber(OPERAND_RIGHT)]);
    check("operator-computes", isNumber(combined, OPERAND_LEFT + OPERAND_RIGHT));
  }

  /** A registration made after the drain was diagnosed and reached no registry. */
  function checkLateRegistrationIgnored(ids: wendoo.RegistrationIdMap, actions: wendoo.HostActionRegistry): void {
    wendoo.pack(LATE_PACK_NAME).bind(LATE_TILE_NAME, new wendoo.HostActionBinding(false));
    check(
      "late-registration-diagnosed",
      diagnosticsFor(wendoo.REGISTRATION_AFTER_SNAPSHOT, LATE_TILE_NAME).length === 1
    );
    check("late-registration-not-bound", actions.getById(ids.idOf(LATE_TILE_NAME)) === undefined);
  }

  /** An action's named output is readable under the name its output tile reads. */
  function checkActionOutput(): void {
    const ctx = newContext();
    ctx.currentRuleFuncId = OUTPUT_RULE_FUNC_ID;
    const typeId = wendoo.structTypeId(TYPE_NAME);
    wendoo.setActionOutput(ctx, typeId, OUTPUT_NAME, wendoo.mkNativeStruct(typeId, undefined));
    const readBack = ctx.services.ruleVars.getByName(
      OUTPUT_RULE_FUNC_ID,
      wendoo.actionOutputVariableName(typeId, OUTPUT_NAME)
    );
    check("action-output-readable-by-name", readBack.t === wendoo.ValueTag.Struct && readBack.typeId === typeId);
  }

  /**
   * Drain what the packs registered, report every diagnostic the drain
   * recorded, and run the checks.
   *
   * @param ids - The project's name-to-id mapping, as its generated entry point builds it.
   */
  export function run(ids: wendoo.RegistrationIdMap): void {
    console.log(`SIMCAP START ${SELFTEST_CASE_ID}`);

    const functions = new wendoo.HostFunctionRegistry();
    wendoo.registerCoreHostFunctions(functions);
    const actions = new wendoo.HostActionRegistry();
    wendoo.registerCoreHostActions(actions);
    const types = new wendoo.StructTypeRegistry();
    wendoo.applyPendingRegistrations(ids, functions, actions, types);

    checkPacksRegisteredBeforeDrain(ids, actions);
    checkDuplicateNameFirstWins(ids, actions);
    checkUnmappedNameDiagnosed(actions);
    checkTypeRegistration(ids, types);
    checkOperatorRegistration(ids, functions);
    checkLateRegistrationIgnored(ids, actions);
    checkActionOutput();

    const recorded = wendoo.registrationDiagnostics();
    for (let i = 0; i < recorded.length; i++) {
      const diagnostic = recorded[i];
      const packs = diagnostic.otherPack.length > 0 ? `${diagnostic.pack} ${diagnostic.otherPack}` : diagnostic.pack;
      console.log(`DIAG registration ${diagnostic.code} ${diagnostic.name} ${packs}`);
    }
    console.log(`CHECKS failed ${failedChecks}`);
    console.log(`SIMCAP PASS ${SELFTEST_CASE_ID}`);
  }
}
