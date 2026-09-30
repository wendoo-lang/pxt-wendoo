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
 * The selftest also serializes the packs' catalog, twice, checking the two
 * payloads are byte-identical, and prints it for the node-side runner to
 * assert.
 *
 * The project also carries a brains module, as the Wendoo simulator
 * extension writes it, declaring programs the editor compiled; the selftest
 * checks that its declarations reached the compiled-brain registry intact
 * before the project's main file ran, that the loader accepts the programs
 * built for the sts-f64 world and refuses the rest by code, and that a
 * program host runs them on actors: pairing each actor with the program it
 * was given, thinking every running program once per drain, and ending an
 * actor's program when the actor ends.
 *
 * Output grammar, one line each:
 *
 * - `DIAG registration <code> <name> <pack> <otherPack>` -- one per recorded
 *   diagnostic, in the order they were found.
 * - `CHECK <check> ok` or `CHECK <check> failed`, one per check.
 * - `ASSERT <check>` -- follows each failed check; the capture harness reads
 *   it as the run's failure.
 * - `CATALOG <payload>` -- the serialized catalog, verbatim.
 * - `wendoo program-rejected <code> <id>` -- one per program the host
 *   refused, as the host logs it.
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

  /**
   * The selftest's icon encoder: renders an opaque icon string as
   * `img<...>`, and renders nothing for the value `unencodable`.
   */
  class SelftestIconEncoder extends wendoo.CatalogIconEncoder {
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    encode(icon: any): string {
      const text = icon as string;
      return text === "unencodable" ? "" : `img<${text}>`;
    }
  }

  /**
   * Serializing the catalog twice yields byte-identical payloads; the
   * payload is printed for the node-side runner to assert.
   */
  function checkCatalog(): void {
    const first = wendoo.serializeCatalog(new SelftestIconEncoder());
    const second = wendoo.serializeCatalog(new SelftestIconEncoder());
    check("catalog-serialize-repeatable", first === second);
    console.log(`CATALOG ${first}`);
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

  /** Document id of the ticker program: one rule restarting its page on every think. */
  const TICKER_ID = "akBQz0nySKaYx37w";

  /** Document ids of the two programs named `Twin`. */
  const TWIN_IDS = ["Hq7EB8SthdeOudyP", "LBddvitRopf1wCnj"];

  /** Document id of the program whose name exercises quotes, a backslash and non-ASCII text. */
  const CHASER_ID = "pUlApzOoEHibF6mH";

  /** Document id of the program with an empty name. */
  const UNNAMED_ID = "UHa4GiKZLGJ8cOzW";

  /** Document id of the program compiled for a foreign device profile. */
  const WRONG_PROFILE_ID = "wrongProfile0001";

  /** Document id of the program declaring a superseded format version. */
  const WRONG_FORMAT_ID = "staleFormat00001";

  /** Every document id the brains module declares, in the order it declares them. */
  const MODULE_ORDER = [TWIN_IDS[0], TWIN_IDS[1], UNNAMED_ID, TICKER_ID, CHASER_ID, WRONG_FORMAT_ID, WRONG_PROFILE_ID];

  /** The registered compiled brain declared under `id`, or `undefined`. */
  function registeredBrain(id: string): wendoo.CompiledBrainRegistration {
    const registered = wendoo.compiledBrainRegistrations();
    for (let i = 0; i < registered.length; i++) {
      if (registered[i].id === id) {
        return registered[i];
      }
    }
    return undefined;
  }

  /**
   * The project's brains module registered its programs in the order the
   * module declares them, with their ids and names intact, and each
   * declaration names the registration of its own id.
   */
  function checkCompiledBrains(): void {
    const registered = wendoo.compiledBrainRegistrations();
    let inOrder = registered.length === MODULE_ORDER.length;
    for (let i = 0; inOrder && i < registered.length; i++) {
      inOrder = registered[i].id === MODULE_ORDER[i];
    }
    check("compiled-brains-registered-in-order", inOrder);
    const chaser = registeredBrain(CHASER_ID);
    const unnamed = registeredBrain(UNNAMED_ID);
    check(
      "compiled-brain-ids-and-names-intact",
      chaser !== undefined &&
        chaser.name === 'Chaser "one" \\ caf\u00e9 \ud83d\ude00' &&
        unnamed !== undefined &&
        unnamed.name === "" &&
        registeredBrain(TWIN_IDS[0]).name === "Twin" &&
        registeredBrain(TWIN_IDS[1]).name === "Twin"
    );
    check(
      "compiled-brain-declarations-bound-by-id",
      wendooPrograms.p_akBQz0nySKaYx37w === registeredBrain(TICKER_ID) &&
        wendooPrograms.p_Hq7EB8SthdeOudyP === registeredBrain(TWIN_IDS[0]) &&
        wendooPrograms.p_LBddvitRopf1wCnj === registeredBrain(TWIN_IDS[1])
    );
  }

  /**
   * The loader accepts a program built for the sts-f64 world and the empty
   * program, refuses a foreign device profile and a superseded format by
   * code, and loads every registration, the refused ones included.
   */
  function checkLoader(): void {
    const types = new wendoo.StructTypeRegistry();
    check(
      "loader-accepts-sts-f64-program",
      wendoo.loadCompiledProgram(registeredBrain(TICKER_ID), types).errorCode === ""
    );
    check("loader-accepts-empty-program", wendoo.loadCompiledProgram(wendooPrograms.none, types).errorCode === "");
    check(
      "loader-refuses-foreign-profile",
      wendoo.loadCompiledProgram(registeredBrain(WRONG_PROFILE_ID), types).errorCode ===
        wendoo.LOAD_ERROR_UNSUPPORTED_DEVICE_PROFILE
    );
    check(
      "loader-refuses-superseded-format",
      wendoo.loadCompiledProgram(registeredBrain(WRONG_FORMAT_ID), types).errorCode ===
        wendoo.DECODE_ERROR_UNSUPPORTED_FORMAT_VERSION
    );
    const loaded = wendoo.loadRegisteredPrograms(types);
    let refused = 0;
    for (let i = 0; i < loaded.length; i++) {
      if (loaded[i].errorCode.length > 0) {
        refused++;
      }
    }
    check("loader-loads-every-registration", loaded.length === MODULE_ORDER.length && refused === 2);
  }

  /** An actor the selftest ends by hand. */
  class SelftestActor extends wendoo.ActorWorld {
    /** Whether the actor has ended. */
    ended: boolean;

    constructor() {
      super();
      this.ended = false;
    }

    hasEnded(): boolean {
      return this.ended;
    }
  }

  /** Counts the page switches the programs it observes make. */
  class PageSwitchCounter extends wendoo.VmObserver {
    /** Page switches seen so far. */
    switches: number;

    constructor() {
      super();
      this.switches = 0;
    }

    onHostActionCall(actionId: number, callSiteId: number, args: wendoo.Value[], result: wendoo.Value): void {
      if (actionId === wendoo.CoreActionId.SwitchPage) {
        this.switches++;
      }
    }
  }

  /** Milliseconds of scheduled time between the selftest's drains. */
  const DRAIN_INTERVAL_MS = 20;

  /** What {@link programOf} answers for an actor running no program. */
  const NOT_RUNNING = "<not running>";

  /** The document id of the program `actor` runs on `host`, or {@link NOT_RUNNING}. */
  function programOf(host: wendoo.ProgramHost, actor: wendoo.ActorWorld): string {
    const hosted = host.hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      if (hosted[i].world === actor) {
        return hosted[i].loaded.registration.id;
      }
    }
    return NOT_RUNNING;
  }

  /**
   * A program host pairs each actor with the program it was given by id,
   * starts nothing before a drain, thinks every running program once per
   * drain -- two programs sharing a name each on its own actor -- runs the
   * empty program as nothing, refuses the programs the loader refuses while
   * the rest run on, replaces an actor's program when it is given another,
   * and ends an actor's program when the actor ends.
   */
  function checkProgramHost(): void {
    const counter = new PageSwitchCounter();
    const host = new wendoo.ProgramHost(counter);
    const ticker = new SelftestActor();
    const twinA = new SelftestActor();
    const twinB = new SelftestActor();
    const idle = new SelftestActor();
    const foreign = new SelftestActor();
    let time = 0;

    host.attach(ticker, wendooPrograms.p_akBQz0nySKaYx37w);
    host.attach(twinA, wendooPrograms.p_Hq7EB8SthdeOudyP);
    host.attach(twinB, wendooPrograms.p_LBddvitRopf1wCnj);
    host.attach(idle, wendooPrograms.none);
    host.attach(foreign, wendooPrograms.p_wrongProfile0001);
    check("host-starts-nothing-before-drain", host.hostedPrograms().length === 0 && counter.switches === 0);

    time += DRAIN_INTERVAL_MS;
    host.drain(time);
    check(
      "host-pairs-each-actor-with-its-program",
      programOf(host, ticker) === TICKER_ID &&
        programOf(host, twinA) === TWIN_IDS[0] &&
        programOf(host, twinB) === TWIN_IDS[1] &&
        programOf(host, idle) === wendooPrograms.none.id &&
        programOf(host, foreign) === NOT_RUNNING &&
        host.hostedPrograms().length === 4
    );
    const rejections = host.rejections();
    check(
      "host-reports-refused-programs-by-code",
      rejections.length === 2 &&
        rejections[0].registration.id === WRONG_FORMAT_ID &&
        rejections[0].errorCode === wendoo.DECODE_ERROR_UNSUPPORTED_FORMAT_VERSION &&
        rejections[1].registration.id === WRONG_PROFILE_ID &&
        rejections[1].errorCode === wendoo.LOAD_ERROR_UNSUPPORTED_DEVICE_PROFILE
    );

    const afterFirst = counter.switches;
    time += DRAIN_INTERVAL_MS;
    host.drain(time);
    time += DRAIN_INTERVAL_MS;
    host.drain(time);
    check("host-thinks-each-running-program-once-per-drain", afterFirst === 3 && counter.switches === 9);

    host.attach(twinB, wendooPrograms.p_akBQz0nySKaYx37w);
    time += DRAIN_INTERVAL_MS;
    host.drain(time);
    check(
      "host-replaces-an-actors-program",
      programOf(host, twinB) === TICKER_ID && host.hostedPrograms().length === 4 && counter.switches === 12
    );

    twinA.ended = true;
    time += DRAIN_INTERVAL_MS;
    host.drain(time);
    let faults = 0;
    const hosted = host.hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      faults += hosted[i].runtime.faults().length;
    }
    check(
      "host-ends-an-ended-actors-program",
      programOf(host, twinA) === NOT_RUNNING && hosted.length === 3 && counter.switches === 14 && faults === 0
    );
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
    wendoo.registerCoreHostFunctions(functions, new wendoo.F64Numerics());
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
    checkCatalog();
    checkCompiledBrains();
    checkLoader();
    checkProgramHost();

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
