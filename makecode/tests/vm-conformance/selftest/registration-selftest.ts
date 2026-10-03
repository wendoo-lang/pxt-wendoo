/*
 * Test-only surface: `gen-selftest.js` copies this file into the generated
 * selftest project and lists it in that project's `pxt.json`, beside the ids
 * module and the brains module the Wendoo simulator extension writes.
 */

/**
 * The registration selftest: it drains what three independently written
 * packs registered at program start through the project's id manifest -- the
 * ids module, as the Wendoo simulator extension writes it from the editor's
 * allocation -- by the drain every program host shares, and reports what the
 * drain did.
 *
 * The three packs are ordinary pxt extensions the project depends on. None
 * is named by anything the selftest calls: each registers from its own
 * top-level code, so a registration found in the registries is proof that
 * pack code ran before the drain.
 *
 * The packs register things that cannot be honoured -- a tile name two packs
 * claim, a name the manifest allocates no id for, a type whose writable fields
 * have no field setter, and one tile per rule a call spec is held to whose
 * argument grammar breaks that rule -- and the selftest registers one more
 * after the drain has closed registration. Every one is expected to be
 * diagnosed and survived: the run reaches its verdict line either way, and
 * that it does is what proves registration is never fatal.
 *
 * The selftest also serializes the packs' catalog, twice, checking the two
 * payloads are byte-identical, and prints it for the node-side runner to
 * assert; and it checks the asset type one pack declares.
 *
 * The project also carries a brains module, as the Wendoo simulator
 * extension writes it, declaring programs the editor compiled; the selftest
 * checks that its declarations reached the compiled-brain registry intact
 * before the project's main file ran, that the loader accepts the programs
 * built for the sts-f64 world and refuses the rest by code, and that a
 * program host runs them on actors: pairing each actor with the program it
 * was given, thinking every running program once per drain, and ending an
 * actor's program when the actor ends. One of the programs places a pack
 * tile; the selftest runs it on a program host of its own, tracing what it
 * does, for the node-side runner to hold to the trace the reference VM
 * renders of the same program.
 *
 * Output grammar, one line each:
 *
 * - `DIAG registration <code> <name> <pack> <otherPack>` -- one per recorded
 *   diagnostic, in the order they were found.
 * - `CHECK <check> ok` or `CHECK <check> failed`, one per check.
 * - `ASSERT <check>` -- follows each failed check; the capture harness reads
 *   it as the run's failure.
 * - `CATALOG <payload>` -- the serialized catalog, verbatim.
 * - `wendoo program-rejected <code> <id>` -- one per program a host
 *   refused, as the host logs it.
 * - `wendoo WENDOO_ASSET_UNRESOLVED <kind> <id>` -- one per asset id the
 *   asset type check reports unresolved, as the VM extension logs it.
 * - `TRACE <line>` -- one per line of the observable trace of the pack-tile
 *   program's run.
 * - `SIMCAP PASS <case>` -- the run reached its end.
 */
namespace registrationSelftest {
  /** Manifest id the capture harness brackets this run's output with. */
  export const SELFTEST_CASE_ID = "registration-selftest";

  /** Tile name both packs claim; the manifest allocates an id for it. */
  const CONTESTED_TILE_NAME = "sensor.beacon.reading";

  /** Tile name only the chime pack claims. */
  const CHIME_TILE_NAME = "actuator.chime.ring";

  /** Tile name the chime pack claims and the manifest allocates no id for. */
  const UNMAPPED_TILE_NAME = "sensor.chime.unmapped";

  /** Operator name the beacon pack claims. */
  const OPERATOR_NAME = "beacon.combine";

  /** Type name the beacon pack claims. */
  const TYPE_NAME = "Beacon";

  /** Field name of the beacon type this selftest reads through. */
  const TYPE_FIELD_NAME = "x";

  /** The beacon type's other declared field. */
  const OTHER_FIELD_NAME = "y";

  /** Field the manifest allocated for the beacon type that the type no longer declares. */
  const RETIRED_FIELD_NAME = "retired";

  /** Tile name registered after the drain has closed registration. */
  const LATE_TILE_NAME = "actuator.chime.late";

  /** Pack name the late registration is made under. */
  const LATE_PACK_NAME = "selftest";

  /** Field id the manifest allocates no field of the beacon type. */
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
    check("beacon-pack-registered-before-drain", actions.getById(ids.actionId(CONTESTED_TILE_NAME)) !== undefined);
    check("chime-pack-registered-before-drain", actions.getById(ids.actionId(CHIME_TILE_NAME)) !== undefined);
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
    const standing = actions.getById(ids.actionId(CONTESTED_TILE_NAME));
    const reading = standing === undefined ? wendoo.NIL_VALUE : standing.execSync(newContext(), []);
    check(
      "duplicate-name-earlier-registration-stands",
      reading.t === wendoo.ValueTag.String && reading.str === diagnostic.otherPack
    );
  }

  /** A name the manifest allocates no id for was diagnosed and left unbound. */
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
   * from the manifest: the field ids are the manifest's, not the fields'
   * declaration positions, and the id of the field the type no longer
   * declares is held by no field.
   */
  function checkTypeRegistration(ids: wendoo.RegistrationIdMap, types: wendoo.StructTypeRegistry): void {
    check(
      "field-writes-unbound-warned",
      diagnosticsFor(wendoo.REGISTRATION_FIELD_WRITES_UNBOUND, TYPE_NAME).length === 1
    );
    const typeId = wendoo.structTypeId(TYPE_NAME);
    const binding = types.getByTypeId(typeId);
    check("warned-type-still-registered", binding !== undefined && binding.atomId === ids.typeAtomId(TYPE_NAME));
    if (binding === undefined) {
      return;
    }
    const mappedFieldId = ids.fieldId(TYPE_NAME, TYPE_FIELD_NAME);
    const otherFieldId = ids.fieldId(TYPE_NAME, OTHER_FIELD_NAME);
    check(
      "type-layout-from-manifest",
      binding.fieldIds.length === 2 &&
        binding.fieldIds[0] === mappedFieldId &&
        binding.fieldIds[1] === otherFieldId &&
        mappedFieldId !== 0 &&
        binding.fieldIds.indexOf(ids.fieldId(TYPE_NAME, RETIRED_FIELD_NAME)) < 0
    );
    const ctx = newContext();
    const value = wendoo.mkNativeStruct(typeId, undefined);
    const mappedRead = binding.fieldGetter(value, mappedFieldId, ctx);
    check("type-field-read-through-mapped-id", mappedRead !== undefined && mappedRead.t === wendoo.ValueTag.Number);
    check("type-field-read-through-unmapped-id", binding.fieldGetter(value, UNBOUND_FIELD_ID, ctx) === undefined);
  }

  /** The operator a pack registered reached the host-function registry and computes. */
  function checkOperatorRegistration(ids: wendoo.RegistrationIdMap, functions: wendoo.HostFunctionRegistry): void {
    const fn = functions.getById(ids.operatorId(OPERATOR_NAME));
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
    check("late-registration-not-bound", actions.getById(ids.actionId(LATE_TILE_NAME)) === undefined);
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

  /** Label the slot builder check declares. */
  const BUILDER_LABEL = "builder label";

  /** Each slot builder puts a label it is given on the slot it builds, and declares none when given none. */
  function checkSlotBuilderLabels(): void {
    const optionalSlot = (wendoo.optionalArg("o", wendoo.TYPE_NUMBER, BUILDER_LABEL) as wendoo.OptionalSpec)
      .item as wendoo.ArgSlotSpec;
    const restSlot = (wendoo.rest("r", wendoo.TYPE_NUMBER, 0, BUILDER_LABEL) as wendoo.RepeatSpec)
      .item as wendoo.ArgSlotSpec;
    const unlabeledRestSlot = (wendoo.rest("r", wendoo.TYPE_NUMBER, 0) as wendoo.RepeatSpec).item as wendoo.ArgSlotSpec;
    check(
      "slot-builders-carry-labels",
      wendoo.arg("a", wendoo.TYPE_NUMBER, BUILDER_LABEL).label === BUILDER_LABEL &&
        wendoo.modifier("m", BUILDER_LABEL).label === BUILDER_LABEL &&
        optionalSlot.label === BUILDER_LABEL &&
        restSlot.label === BUILDER_LABEL &&
        wendoo.arg("a", wendoo.TYPE_NUMBER).label === "" &&
        wendoo.modifier("m").label === "" &&
        unlabeledRestSlot.label === ""
    );
  }

  /** Sentence form the language builder check declares. */
  const BUILDER_FORM = "builder form";

  /** Bare word the language builder check declares. */
  const BUILDER_BARE = "builder bare";

  /**
   * The language builder puts each word it is given in its field and leaves
   * the rest undeclared; the modifier builder puts the words it is given on
   * the slot it builds; and a slot or tile built without words declares
   * none.
   */
  function checkLanguageBuilders(): void {
    const full = wendoo.tileLanguage(BUILDER_FORM, wendoo.SENTENCE_FRAME_STATE, BUILDER_BARE);
    const formOnly = wendoo.tileLanguage(BUILDER_FORM);
    const carried = wendoo.modifier("m", BUILDER_LABEL, full).language;
    const unworded = wendoo.modifier("m").language;
    const tile = new wendoo.TileSpec(wendoo.TILE_KIND_SENSOR, [], "").language;
    check(
      "language-builders-carry-words",
      full.form === BUILDER_FORM &&
        full.frame === wendoo.SENTENCE_FRAME_STATE &&
        full.bare === BUILDER_BARE &&
        formOnly.form === BUILDER_FORM &&
        formOnly.frame === "" &&
        formOnly.bare === "" &&
        carried === full &&
        unworded.form === "" &&
        unworded.frame === "" &&
        unworded.bare === "" &&
        tile.form === "" &&
        tile.frame === "" &&
        tile.bare === ""
    );
  }

  /** Tiles the grammar pack registers with well-formed argument grammars. */
  const WELL_FORMED_GRAMMAR_TILES = [
    "sensor.grammar.pad",
    "actuator.grammar.move",
    "actuator.grammar.chant",
    "sensor.grammar.defaults",
    "actuator.grammar.travel",
  ];

  /** The grammar pack's tile one shared parameter tile fills twice, its two slots named apart. */
  const TILE_REUSING_TILE_NAME = "actuator.grammar.travel";

  /** Slot or spec name every ill-formed grammar tile breaks its rule on. */
  const ILL_FORMED_SPEC_NAME = "amount";

  /** The grammar pack's tiles with well-formed argument grammars all reached the action registry. */
  function checkWellFormedGrammars(ids: wendoo.RegistrationIdMap, actions: wendoo.HostActionRegistry): void {
    let registered = true;
    for (let i = 0; i < WELL_FORMED_GRAMMAR_TILES.length; i++) {
      registered = registered && actions.getById(ids.actionId(WELL_FORMED_GRAMMAR_TILES[i])) !== undefined;
    }
    check("call-spec-well-formed-tiles-registered", registered);
    let reuseDiagnosed = false;
    const recorded = wendoo.registrationDiagnostics();
    for (let i = 0; i < recorded.length; i++) {
      reuseDiagnosed = reuseDiagnosed || recorded[i].name === TILE_REUSING_TILE_NAME;
    }
    check(
      "call-spec-tile-fills-two-named-slots",
      !reuseDiagnosed && actions.getById(ids.actionId(TILE_REUSING_TILE_NAME)) !== undefined
    );
  }

  /**
   * The tile `tileName`, whose argument grammar breaks one rule, was
   * diagnosed once under `code` naming the offending spec, and was ignored:
   * no other diagnostic names it, and it never reached the catalog, so the
   * manifest allocates it no id.
   *
   * @param checkName - Stable name of the check.
   * @param code - Diagnostic code the broken rule is reported under.
   * @param tileName - Name of the ill-formed tile.
   */
  function checkIllFormedGrammar(
    checkName: string,
    code: string,
    tileName: string,
    ids: wendoo.RegistrationIdMap
  ): void {
    const reported = diagnosticsFor(code, tileName);
    let otherDiagnostics = 0;
    const recorded = wendoo.registrationDiagnostics();
    for (let i = 0; i < recorded.length; i++) {
      if (recorded[i].name === tileName && recorded[i].code !== code) {
        otherDiagnostics++;
      }
    }
    check(
      checkName,
      reported.length === 1 &&
        reported[0].spec === ILL_FORMED_SPEC_NAME &&
        reported[0].otherPack === "" &&
        otherDiagnostics === 0 &&
        ids.actionId(tileName) === wendoo.UNASSIGNED_ID
    );
  }

  /** Every rule a call spec is held to rejects the grammar pack's tile breaking it. */
  function checkIllFormedGrammars(ids: wendoo.RegistrationIdMap): void {
    checkIllFormedGrammar(
      "call-spec-rejects-default-and-derived",
      wendoo.REGISTRATION_ARG_DEFAULT_AND_DERIVED,
      "actuator.grammar.default-and-derived",
      ids
    );
    checkIllFormedGrammar(
      "call-spec-rejects-required-with-default",
      wendoo.REGISTRATION_ARG_REQUIRED_WITH_EMPTY_MEANING,
      "actuator.grammar.required-with-default",
      ids
    );
    checkIllFormedGrammar(
      "call-spec-rejects-required-with-derived",
      wendoo.REGISTRATION_ARG_REQUIRED_WITH_EMPTY_MEANING,
      "actuator.grammar.required-with-derived",
      ids
    );
    checkIllFormedGrammar(
      "call-spec-rejects-range-without-bounds",
      wendoo.REGISTRATION_ARG_RANGE_UNBOUNDED,
      "actuator.grammar.range-unbounded",
      ids
    );
    checkIllFormedGrammar(
      "call-spec-rejects-inverted-range",
      wendoo.REGISTRATION_ARG_RANGE_INVERTED,
      "actuator.grammar.range-inverted",
      ids
    );
    checkIllFormedGrammar(
      "call-spec-rejects-range-on-non-numeric-default",
      wendoo.REGISTRATION_ARG_RANGE_NON_NUMERIC,
      "actuator.grammar.range-non-numeric",
      ids
    );
    checkIllFormedGrammar(
      "call-spec-rejects-duplicate-name",
      wendoo.REGISTRATION_CALL_SPEC_DUPLICATE_NAME,
      "actuator.grammar.duplicate-name",
      ids
    );
    checkIllFormedGrammar(
      "call-spec-checks-names-before-slots",
      wendoo.REGISTRATION_CALL_SPEC_DUPLICATE_NAME,
      "actuator.grammar.names-checked-first",
      ids
    );
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

  /** Output name the core-typed action-output check writes and reads back. */
  const CORE_OUTPUT_NAME = "speed";

  /**
   * The rule variable the reference compiler reads a number output named
   * {@link CORE_OUTPUT_NAME} from: the output key of the core number TypeId
   * and that name.
   */
  const CORE_OUTPUT_VARIABLE = "__out.number:<number>.speed";

  /** Value the core-typed action-output check writes. */
  const CORE_OUTPUT_VALUE = 3;

  /** A number output written under the core number TypeId constant lands where the reference compiler reads it. */
  function checkCoreTypedActionOutput(): void {
    const ctx = newContext();
    ctx.currentRuleFuncId = OUTPUT_RULE_FUNC_ID;
    wendoo.setActionOutput(ctx, wendoo.TYPE_ID_NUMBER, CORE_OUTPUT_NAME, wendoo.mkNumber(CORE_OUTPUT_VALUE));
    const readBack = ctx.services.ruleVars.getByName(OUTPUT_RULE_FUNC_ID, CORE_OUTPUT_VARIABLE);
    check("action-output-core-typed-readable-by-name", isNumber(readBack, CORE_OUTPUT_VALUE));
  }

  /** Field name of every asset type's one field, which holds the asset's id. */
  const ASSET_FIELD_NAME = "asset";

  /** Asset id of the tune value the asset-type checks read. */
  const TUNE_ASSET_ID = "tune1";

  /** The tune value a compiled program carries holding `asset` in its asset field, at the field id the manifest allocates. */
  function tuneLiteral(asset: wendoo.Value): wendoo.Value {
    const fieldId = wendoo.projectIds().fieldId(chime.TUNE_TYPE, ASSET_FIELD_NAME);
    const slots: wendoo.Value[] = [];
    for (let i = 0; i <= fieldId; i++) {
      slots.push(wendoo.NIL_VALUE);
    }
    slots[fieldId] = asset;
    return wendoo.mkStruct(wendoo.structTypeId(chime.TUNE_TYPE), slots);
  }

  /**
   * The chime pack's asset type was registered under the manifest's atom,
   * its one asset field under the manifest's field id; it reads the asset id
   * of a value of its own type and of no other value; and it reports each
   * asset id it is told is unresolved once, however often it is told, for the
   * node-side runner to hold to its expected lines.
   */
  function checkAssetType(ids: wendoo.RegistrationIdMap, types: wendoo.StructTypeRegistry): void {
    const binding = chime.tuneBinding;
    check(
      "asset-type-takes-its-atom-and-field-from-the-manifest",
      types.getByTypeId(wendoo.structTypeId(chime.TUNE_TYPE)) === binding &&
        binding.atomId === ids.typeAtomId(chime.TUNE_TYPE) &&
        binding.assetKind === chime.TUNE_ASSET_KIND &&
        binding.fieldIds.length === 1 &&
        binding.fieldIds[0] === ids.fieldId(chime.TUNE_TYPE, ASSET_FIELD_NAME)
    );
    check(
      "asset-type-reads-the-asset-id-of-its-own-values",
      binding.assetIdOf(tuneLiteral(wendoo.mkString(TUNE_ASSET_ID))) === TUNE_ASSET_ID &&
        binding.assetIdOf(wendoo.mkStruct(wendoo.structTypeId(TYPE_NAME), [wendoo.mkString(TUNE_ASSET_ID)])) === "" &&
        binding.assetIdOf(wendoo.mkString(TUNE_ASSET_ID)) === "" &&
        binding.assetIdOf(wendoo.NIL_VALUE) === ""
    );
    binding.reportUnresolved("gone");
    binding.reportUnresolved("lost");
    binding.reportUnresolved("gone");
  }

  /** Document id of the ticker program: one rule restarting its page on every think. */
  const TICKER_ID = "akBQz0nySKaYx37w";

  /** Document ids of the two programs named `Twin`. */
  const TWIN_IDS = ["Hq7EB8SthdeOudyP", "LBddvitRopf1wCnj"];

  /** Document id of the program whose name exercises quotes, a backslash and non-ASCII text. */
  const CHASER_ID = "pUlApzOoEHibF6mH";

  /** Document id of the program with an empty name. */
  const UNNAMED_ID = "UHa4GiKZLGJ8cOzW";

  /** Document id of the program placing the chime pack's ring tile. */
  const RINGER_ID = "ringerRingerRing";

  /** Document id of the program compiled for a foreign device profile. */
  const WRONG_PROFILE_ID = "wrongProfile0001";

  /** Document id of the program declaring a superseded format version. */
  const WRONG_FORMAT_ID = "staleFormat00001";

  /** Every document id the brains module declares, in the order it declares them. */
  const MODULE_ORDER = [
    TWIN_IDS[0],
    TWIN_IDS[1],
    UNNAMED_ID,
    TICKER_ID,
    CHASER_ID,
    RINGER_ID,
    WRONG_FORMAT_ID,
    WRONG_PROFILE_ID,
  ];

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
      wendooBrains.p_akBQz0nySKaYx37w === registeredBrain(TICKER_ID) &&
        wendooBrains.p_Hq7EB8SthdeOudyP === registeredBrain(TWIN_IDS[0]) &&
        wendooBrains.p_LBddvitRopf1wCnj === registeredBrain(TWIN_IDS[1])
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
    check("loader-accepts-empty-program", wendoo.loadCompiledProgram(wendooBrains.none, types).errorCode === "");
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

    host.attach(ticker, wendooBrains.p_akBQz0nySKaYx37w);
    host.attach(twinA, wendooBrains.p_Hq7EB8SthdeOudyP);
    host.attach(twinB, wendooBrains.p_LBddvitRopf1wCnj);
    host.attach(idle, wendooBrains.none);
    host.attach(foreign, wendooBrains.p_wrongProfile0001);
    check("host-starts-nothing-before-drain", host.hostedPrograms().length === 0 && counter.switches === 0);

    time += DRAIN_INTERVAL_MS;
    host.drain(time);
    check(
      "host-pairs-each-actor-with-its-program",
      programOf(host, ticker) === TICKER_ID &&
        programOf(host, twinA) === TWIN_IDS[0] &&
        programOf(host, twinB) === TWIN_IDS[1] &&
        programOf(host, idle) === wendooBrains.none.id &&
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

    host.attach(twinB, wendooBrains.p_akBQz0nySKaYx37w);
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

  /** Hands each trace line to the console under the `TRACE ` prefix. */
  class PrefixedTraceSink extends wendoo.TraceSink {
    line(text: string): void {
      console.log(`TRACE ${text}`);
    }
  }

  /** Milliseconds of scheduled time each think of the traced run advances, one think per entry. */
  const RINGER_SCHEDULE = [DRAIN_INTERVAL_MS, DRAIN_INTERVAL_MS, DRAIN_INTERVAL_MS];

  /**
   * Run the program placing the chime pack's ring tile on an actor of a
   * program host of its own, over {@link RINGER_SCHEDULE}, tracing every
   * effect it has: a tick line before each drain, then the actions the drain
   * dispatches. The node-side runner holds the trace to the one the reference
   * VM renders of the same program.
   */
  function traceRinger(): void {
    const writer = new wendoo.ObservableTraceWriter(new PrefixedTraceSink(), wendoo.STS_F64_PROFILE_ID);
    const host = new wendoo.ProgramHost(new wendoo.TraceTap(writer));
    const actor = new SelftestActor();
    host.attach(actor, wendooBrains.p_ringerRingerRing);
    let time = 0;
    for (let i = 0; i < RINGER_SCHEDULE.length; i++) {
      const next = time + RINGER_SCHEDULE[i];
      writer.tick(i + 1, next, time === 0 ? 0 : next - time);
      host.drain(next);
      time = next;
    }
    check("golden-program-runs", programOf(host, actor) === RINGER_ID);
  }

  /**
   * Drain what the packs registered through the project's id manifest, by
   * the drain every program host shares, report every diagnostic recorded,
   * and run the checks.
   */
  export function run(): void {
    console.log(`SIMCAP START ${SELFTEST_CASE_ID}`);

    const registries = wendoo.hostRegistries();
    const ids = wendoo.projectIds();
    const functions = registries.functions;
    const actions = registries.actions;
    const types = registries.types;

    checkPacksRegisteredBeforeDrain(ids, actions);
    checkDuplicateNameFirstWins(ids, actions);
    checkUnmappedNameDiagnosed(actions);
    checkTypeRegistration(ids, types);
    checkOperatorRegistration(ids, functions);
    checkLateRegistrationIgnored(ids, actions);
    checkWellFormedGrammars(ids, actions);
    checkIllFormedGrammars(ids);
    checkActionOutput();
    checkCoreTypedActionOutput();
    checkCatalog();
    checkSlotBuilderLabels();
    checkLanguageBuilders();
    checkAssetType(ids, types);
    checkCompiledBrains();
    checkLoader();
    checkProgramHost();
    traceRinger();

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
