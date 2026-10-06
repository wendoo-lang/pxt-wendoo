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
 * argument grammar breaks that rule -- and the selftest registers one more,
 * and gives a core tile an icon, after the drain has closed registration.
 * Every one is expected to be diagnosed and survived: the run reaches its
 * verdict line either way, and that it does is what proves registration is
 * never fatal.
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
 * was given, thinking every running program once per drain, ending an
 * actor's program when the actor ends, and reporting each fault a program
 * raises -- a throw out of its tile or its page-activation hook among them --
 * to the host's observer while every drain runs on. One of the programs
 * places a pack tile; the selftest runs it on a program host of its own,
 * tracing what it does, for the node-side runner to hold to the trace the
 * reference VM renders of the same program.
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
 * - `wendoo program-faulted <code> <id>` -- one per fault code each running
 *   program raises, the first time it raises it, as the host logs it.
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

  /** Core tile given an icon after the drain has closed registration. */
  const LATE_CORE_TILE_ID = "tile.op->not";

  /** Core type given an icon after the drain has closed registration. */
  const LATE_CORE_TYPE_NAME = "string";

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

  /** A core tile icon given after the drain has closed registration was diagnosed. */
  function checkLateCoreTileIconIgnored(): void {
    wendoo.pack(LATE_PACK_NAME).defineCoreTileIcon(LATE_CORE_TILE_ID, "late");
    check(
      "late-core-tile-icon-diagnosed",
      diagnosticsFor(wendoo.REGISTRATION_AFTER_SNAPSHOT, LATE_CORE_TILE_ID).length === 1
    );
  }

  /** A core type icon given after the drain has closed registration was diagnosed. */
  function checkLateCoreTypeIconIgnored(): void {
    wendoo.pack(LATE_PACK_NAME).defineCoreTypeIcon(LATE_CORE_TYPE_NAME, "late");
    check(
      "late-core-type-icon-diagnosed",
      diagnosticsFor(wendoo.REGISTRATION_AFTER_SNAPSHOT, LATE_CORE_TYPE_NAME).length === 1
    );
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

  /**
   * The accessor builder gives the field it is passed an accessor carrying
   * the label and icon it is passed, none when given none, and returns that
   * same field; a field built without it has no accessor; and a tile spec
   * declares neither sensor flag until set.
   */
  function checkAccessorAndSensorFlagDefaults(): void {
    const plain = wendoo.field("f", wendoo.TYPE_NUMBER);
    const accessible = wendoo.field("f", wendoo.TYPE_NUMBER);
    const bare = wendoo.withAccessor(wendoo.field("g", wendoo.TYPE_NUMBER)).accessor;
    const spec = new wendoo.TileSpec(wendoo.TILE_KIND_SENSOR, [], wendoo.TYPE_NUMBER);
    check(
      "accessor-builder-carries-metadata-and-sensor-flags-default-off",
      wendoo.withAccessor(accessible, BUILDER_LABEL, "icon") === accessible &&
        accessible.accessor.label === BUILDER_LABEL &&
        accessible.accessor.icon === "icon" &&
        bare !== undefined &&
        bare.label === "" &&
        bare.icon === undefined &&
        plain.accessor === undefined &&
        wendoo.readOnlyField("r", wendoo.TYPE_NUMBER).accessor === undefined &&
        !spec.inline &&
        !spec.writableResult
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

  /** FuncId of the core host function reading a brain variable by name. */
  const BRAIN_CONTEXT_GET_VARIABLE = 48;

  /** FuncId of the core host function writing a brain variable by name. */
  const BRAIN_CONTEXT_SET_VARIABLE = 49;

  /** FuncId of the core host function reading a rule variable by name. */
  const RULE_CONTEXT_GET_VARIABLE = 50;

  /** FuncId of the core host function writing a rule variable by name. */
  const RULE_CONTEXT_SET_VARIABLE = 51;

  /** Rule funcId of the parent rule the rule-variable checks read through. */
  const PARENT_RULE = 3;

  /** Rule funcId of the child rule the rule-variable checks run in. */
  const CHILD_RULE = 4;

  /**
   * What the core host function `funcId` returns given the method receiver
   * nil, then `args`, in `ctx`; `undefined` when no function is registered
   * under `funcId`.
   */
  function callContextFunction(
    functions: wendoo.HostFunctionRegistry,
    funcId: number,
    ctx: wendoo.ExecutionContext,
    args: wendoo.Value[]
  ): wendoo.Value {
    const fn = functions.getById(funcId);
    return fn ? fn.exec(ctx, [wendoo.NIL_VALUE].concat(args)) : undefined;
  }

  /**
   * The context variable host functions: reading a rule variable by name
   * finds it on the running rule or the nearest rule above it, nil when none
   * holds it; writing one stores it on the running rule alone, and nowhere
   * while no rule runs; reading a brain variable by name reads the program's
   * variable of that name, its starting value until written, writing one
   * stores it there, a name the program declares no variable for is stored
   * apart and read back, and an unwritten one reads nil.
   */
  function checkContextVariables(functions: wendoo.HostFunctionRegistry): void {
    const ruleCtx = newContext();
    ruleCtx.services.program.ruleChildren = [CHILD_RULE];
    ruleCtx.services.program.ruleParents = [PARENT_RULE];
    ruleCtx.services.ruleVars.setByName(PARENT_RULE, "shared", wendoo.mkNumber(5));
    ruleCtx.currentRuleFuncId = CHILD_RULE;
    const inherited = callContextFunction(functions, RULE_CONTEXT_GET_VARIABLE, ruleCtx, [wendoo.mkString("shared")]);
    const missing = callContextFunction(functions, RULE_CONTEXT_GET_VARIABLE, ruleCtx, [wendoo.mkString("absent")]);
    check(
      "rule-context-get-variable-reads-up-the-rule-chain",
      inherited !== undefined && isNumber(inherited, 5) && missing !== undefined && missing.t === wendoo.ValueTag.Nil
    );

    const written = callContextFunction(functions, RULE_CONTEXT_SET_VARIABLE, ruleCtx, [
      wendoo.mkString("own"),
      wendoo.mkNumber(7),
    ]);
    const ownRead = ruleCtx.services.ruleVars.getByName(CHILD_RULE, "own");
    const parentRead = ruleCtx.services.ruleVars.getByName(PARENT_RULE, "own");
    ruleCtx.currentRuleFuncId = wendoo.NO_RULE;
    callContextFunction(functions, RULE_CONTEXT_SET_VARIABLE, ruleCtx, [wendoo.mkString("stray"), wendoo.mkNumber(1)]);
    check(
      "rule-context-set-variable-writes-the-running-rule-alone",
      written !== undefined &&
        written.t === wendoo.ValueTag.Nil &&
        isNumber(ownRead, 7) &&
        parentRead.t === wendoo.ValueTag.Nil &&
        ruleCtx.services.ruleVars.getByName(PARENT_RULE, "stray").t === wendoo.ValueTag.Nil &&
        ruleCtx.services.ruleVars.getByName(CHILD_RULE, "stray").t === wendoo.ValueTag.Nil
    );

    const brainCtx = newContext();
    const program = brainCtx.services.program;
    program.variableNames = ["score"];
    program.constValues = [wendoo.mkNumber(10)];
    program.variableInitValues = [0];
    brainCtx.variables.install(program);
    const seeded = callContextFunction(functions, BRAIN_CONTEXT_GET_VARIABLE, brainCtx, [wendoo.mkString("score")]);
    const set = callContextFunction(functions, BRAIN_CONTEXT_SET_VARIABLE, brainCtx, [
      wendoo.mkString("score"),
      wendoo.mkNumber(11),
    ]);
    callContextFunction(functions, BRAIN_CONTEXT_SET_VARIABLE, brainCtx, [
      wendoo.mkString("extra"),
      wendoo.mkNumber(12),
    ]);
    const extra = callContextFunction(functions, BRAIN_CONTEXT_GET_VARIABLE, brainCtx, [wendoo.mkString("extra")]);
    const unwritten = callContextFunction(functions, BRAIN_CONTEXT_GET_VARIABLE, brainCtx, [wendoo.mkString("never")]);
    check(
      "brain-context-variables-read-and-write-by-name",
      seeded !== undefined &&
        isNumber(seeded, 10) &&
        set !== undefined &&
        set.t === wendoo.ValueTag.Nil &&
        isNumber(brainCtx.variables.getBySlot(0), 11) &&
        extra !== undefined &&
        isNumber(extra, 12) &&
        unwritten !== undefined &&
        unwritten.t === wendoo.ValueTag.Nil
    );
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

  /** Document id of the program whose first page switches to its second, which places the chime pack's ring tile. */
  const PEALER_ID = "pealerPealerPeal";

  /** Document id of the program whose two pages each switch to the other once their timer runs out. */
  const FLIPPER_ID = "flipperFlipperFl";

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
    FLIPPER_ID,
    CHASER_ID,
    PEALER_ID,
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

  /** Records what the programs it observes do: the page switches they make and the faults they raise. */
  class EffectRecorder extends wendoo.VmObserver {
    /** Page switches seen so far. */
    switches: number;
    /** Faults seen so far. */
    faults: number;
    /** Id of the fiber the latest fault was raised on, or -1 before the first fault. */
    lastFiberId: number;
    /** The latest fault, or `undefined` before the first fault. */
    lastFault: wendoo.VmFault;

    constructor() {
      super();
      this.switches = 0;
      this.faults = 0;
      this.lastFiberId = -1;
      this.lastFault = undefined;
    }

    onHostActionCall(actionId: number, callSiteId: number, args: wendoo.Value[], result: wendoo.Value): void {
      if (actionId === wendoo.CoreActionId.SwitchPage) {
        this.switches++;
      }
    }

    onFiberFault(fiberId: number, fault: wendoo.VmFault): void {
      this.faults++;
      this.lastFiberId = fiberId;
      this.lastFault = fault;
    }

    /** Whether the latest fault carries `code`. */
    lastFaultIs(code: number): boolean {
      return this.lastFault !== undefined && this.lastFault.code === code;
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
    const counter = new EffectRecorder();
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
    check(
      "host-ends-an-ended-actors-program",
      programOf(host, twinA) === NOT_RUNNING &&
        host.hostedPrograms().length === 3 &&
        counter.switches === 14 &&
        counter.faults === 0
    );
  }

  /** How many drains the fault checks run while the ring tile fails. */
  const FAILING_DRAINS = 3;

  /** Run one drain of `host` at `timeMs`, and answer whether it returned without throwing. */
  function drainSurvives(host: wendoo.ProgramHost, timeMs: number): boolean {
    let survived = true;
    try {
      host.drain(timeMs);
    } catch (e) {
      survived = false;
    }
    return survived;
  }

  /** The program running on `actor` in `host`, or `undefined` when none does. */
  function hostedOn(host: wendoo.ProgramHost, actor: wendoo.ActorWorld): wendoo.HostedProgram {
    const hosted = host.hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      if (hosted[i].world === actor) {
        return hosted[i];
      }
    }
    return undefined;
  }

  /**
   * A program whose tile faults at every think reports each fault to its
   * host's observer as the fault is raised -- its code, its message and the
   * instruction that raised it -- and runs on, thinking and faulting again at
   * every drain.
   */
  function checkFaultEvents(): void {
    const recorder = new EffectRecorder();
    const host = new wendoo.ProgramHost(recorder);
    const actor = new SelftestActor();
    host.attach(actor, wendooBrains.p_ringerRingerRing);
    chime.ringFailure = chime.RING_FAULTS;
    let time = 0;
    for (let i = 0; i < FAILING_DRAINS; i++) {
      time += DRAIN_INTERVAL_MS;
      host.drain(time);
    }
    chime.ringFailure = chime.RING_RINGS;
    const last = recorder.lastFault;
    check(
      "a-faulting-program-reports-every-fault-to-its-hosts-observer-with-its-code-message-and-site",
      recorder.faults === FAILING_DRAINS &&
        recorder.lastFaultIs(wendoo.ErrorCode.HostError) &&
        last.message === chime.CRACKED_MESSAGE &&
        last.funcId >= 0 &&
        last.pc >= 0 &&
        recorder.lastFiberId !== wendoo.NO_FIBER &&
        programOf(host, actor) === RINGER_ID
    );
  }

  /**
   * A program whose tile raises a fault and then throws at every think
   * faults the fiber running the tile `ScriptError` at each throw, the fault
   * raised before the throw discarded, reported to its host's observer,
   * while every drain runs on: the other program thinks at every drain, and
   * the throwing program stays on its actor, thinks again at the next drain,
   * and rings without a fault once its tile no longer throws.
   */
  function checkThrowingTile(): void {
    const recorder = new EffectRecorder();
    const host = new wendoo.ProgramHost(recorder);
    const ringing = new SelftestActor();
    const ticking = new SelftestActor();
    host.attach(ringing, wendooBrains.p_ringerRingerRing);
    host.attach(ticking, wendooBrains.p_akBQz0nySKaYx37w);
    chime.ringFailure = chime.RING_THROWS;
    let time = 0;
    let survived = true;
    for (let i = 0; i < FAILING_DRAINS; i++) {
      time += DRAIN_INTERVAL_MS;
      survived = drainSurvives(host, time) && survived;
    }
    chime.ringFailure = chime.RING_RINGS;
    const faultsWhileThrowing = recorder.faults;
    const faultedScriptError = recorder.lastFaultIs(wendoo.ErrorCode.ScriptError);
    const faultedOnAFiber = recorder.lastFiberId !== wendoo.NO_FIBER && recorder.lastFault.funcId >= 0;
    const rings = chime.ringActuator.rings;
    time += DRAIN_INTERVAL_MS;
    survived = drainSurvives(host, time) && survived;
    check(
      "a-throwing-tile-faults-its-fiber-and-every-drain-runs-on",
      survived &&
        faultsWhileThrowing === FAILING_DRAINS &&
        faultedScriptError &&
        faultedOnAFiber &&
        recorder.faults === FAILING_DRAINS &&
        recorder.switches === FAILING_DRAINS + 1 &&
        programOf(host, ringing) === RINGER_ID &&
        chime.ringActuator.rings === rings + 1
    );
  }

  /**
   * A program whose tile's page-activation hook throws as the program starts
   * faults `ScriptError` outside every fiber, reported to its host's
   * observer, while every drain runs on: the other program thinks at every
   * drain, and the throwing program stays on its actor and thinks at every
   * drain.
   */
  function checkThrowingPageHook(): void {
    const recorder = new EffectRecorder();
    const host = new wendoo.ProgramHost(recorder);
    const ringing = new SelftestActor();
    const ticking = new SelftestActor();
    host.attach(ringing, wendooBrains.p_ringerRingerRing);
    host.attach(ticking, wendooBrains.p_akBQz0nySKaYx37w);
    chime.ringFailure = chime.RING_HOOK_THROWS;
    let time = 0;
    let survived = true;
    for (let i = 0; i < FAILING_DRAINS; i++) {
      time += DRAIN_INTERVAL_MS;
      survived = drainSurvives(host, time) && survived;
    }
    chime.ringFailure = chime.RING_RINGS;
    const hosted = hostedOn(host, ringing);
    check(
      "a-throwing-page-hook-faults-its-program-and-every-drain-runs-on",
      survived &&
        recorder.faults === 1 &&
        recorder.lastFiberId === wendoo.NO_FIBER &&
        recorder.lastFaultIs(wendoo.ErrorCode.ScriptError) &&
        recorder.switches === FAILING_DRAINS &&
        hosted !== undefined &&
        hosted.runtime.tickCount() === FAILING_DRAINS
    );
  }

  /**
   * A program whose second page's tile has a page-activation hook that
   * throws, as the program's first think switches to that page, faults
   * `ScriptError` outside every fiber in the think that activates the page,
   * reported to its host's observer, while every drain runs on: the other
   * program thinks at every drain, and the throwing program stays on its
   * actor and thinks again at the next drain.
   */
  function checkThrowingPageSwitch(): void {
    const recorder = new EffectRecorder();
    const host = new wendoo.ProgramHost(recorder);
    const pealing = new SelftestActor();
    const ticking = new SelftestActor();
    host.attach(pealing, wendooBrains.p_pealerPealerPeal);
    host.attach(ticking, wendooBrains.p_akBQz0nySKaYx37w);
    chime.ringFailure = chime.RING_HOOK_THROWS;
    let time = 0;
    let survived = true;
    for (let i = 0; i < FAILING_DRAINS; i++) {
      time += DRAIN_INTERVAL_MS;
      survived = drainSurvives(host, time) && survived;
    }
    chime.ringFailure = chime.RING_RINGS;
    const hosted = hostedOn(host, pealing);
    check(
      "a-page-hook-throwing-on-a-page-switch-faults-its-program-and-every-drain-runs-on",
      survived &&
        recorder.faults === 1 &&
        recorder.lastFiberId === wendoo.NO_FIBER &&
        recorder.lastFaultIs(wendoo.ErrorCode.ScriptError) &&
        recorder.switches === FAILING_DRAINS + 1 &&
        hosted !== undefined &&
        hosted.loaded.registration.id === PEALER_ID &&
        hosted.runtime.tickCount() === FAILING_DRAINS - 1
    );
  }

  /** Records the drain each page switch a program makes is made in, and counts the faults programs raise. */
  class SwitchTimeline extends wendoo.VmObserver {
    /** The 1-based number of the drain running now; the selftest sets it before each drain. */
    drain: number;
    /** The drain of each page switch, in the order they were made. */
    switchDrains: number[];
    /** Faults seen so far. */
    faults: number;

    constructor() {
      super();
      this.drain = 0;
      this.switchDrains = [];
      this.faults = 0;
    }

    onHostActionCall(actionId: number, callSiteId: number, args: wendoo.Value[], result: wendoo.Value): void {
      if (actionId === wendoo.CoreActionId.SwitchPage) {
        this.switchDrains.push(this.drain);
      }
    }

    onFiberFault(fiberId: number, fault: wendoo.VmFault): void {
      this.faults++;
    }
  }

  /** How many drains the timer checks run the flipper program for. */
  const FLIPPER_DRAINS = 24;

  /**
   * The drains the flipper program switches pages in. Its first page is
   * entered in drain 1, and each page's 100 ms timer runs out five drains
   * after the drain its page is entered in; a switch is served at the start
   * of the next drain.
   */
  const FLIPPER_SWITCH_DRAINS = [6, 12, 18, 24];

  /** Whether `actual` holds the numbers `expected` holds, in the same order. */
  function sameNumbers(actual: number[], expected: number[]): boolean {
    if (actual.length !== expected.length) {
      return false;
    }
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * A program whose two pages each switch to the other once a timer runs out
   * ping-pongs between them without a fault: each page's timer runs out a
   * timer's length after the page is entered, and runs that length again
   * every time the page is entered again -- the first page's timer, which ran
   * out before the program left the page, does not run out the moment the
   * program comes back.
   */
  function checkTimerPagePingPong(): void {
    const timeline = new SwitchTimeline();
    const host = new wendoo.ProgramHost(timeline);
    const actor = new SelftestActor();
    host.attach(actor, wendooBrains.p_flipperFlipperFl);
    let time = 0;
    for (let drain = 1; drain <= FLIPPER_DRAINS; drain++) {
      timeline.drain = drain;
      time += DRAIN_INTERVAL_MS;
      host.drain(time);
    }
    const drains = timeline.switchDrains;
    check(
      "timer-switches-each-page-in-turn",
      timeline.faults === 0 &&
        programOf(host, actor) === FLIPPER_ID &&
        drains.length >= 2 &&
        drains[0] === FLIPPER_SWITCH_DRAINS[0] &&
        drains[1] === FLIPPER_SWITCH_DRAINS[1]
    );
    check(
      "timer-restarts-when-its-page-is-entered-again",
      timeline.faults === 0 && sameNumbers(drains, FLIPPER_SWITCH_DRAINS)
    );
  }

  /** How many thinks the timer argument check reads each of its call sites over. */
  const TIMER_READ_TICKS = 15;

  /** Milliseconds of scheduled time between the thinks of the timer argument check. */
  const TIMER_READ_INTERVAL_MS = 100;

  /**
   * The ticks, from 1 to {@link TIMER_READ_TICKS}, on which the timer sensor
   * `timeout` fires at the call site `callSiteId` of `ctx`, reading `delay`
   * on every one; empty when `timeout` is not registered.
   */
  function timerFirings(
    timeout: wendoo.HostActionBinding,
    ctx: wendoo.ExecutionContext,
    callSiteId: number,
    delay: wendoo.Value
  ): number[] {
    const fired: number[] = [];
    if (!timeout) {
      return fired;
    }
    ctx.currentCallSiteId = callSiteId;
    for (let tick = 1; tick <= TIMER_READ_TICKS; tick++) {
      ctx.currentTick = tick;
      ctx.time = tick * TIMER_READ_INTERVAL_MS;
      const result = timeout.execSync(ctx, [delay]);
      if (result.t === wendoo.ValueTag.Boolean && result.b) {
        fired.push(tick);
      }
    }
    return fired;
  }

  /**
   * The timer sensor read with no seconds runs for its default one second,
   * while one read with a not-a-number or a value that is no number never
   * fires, however long it runs.
   */
  function checkTimerArguments(actions: wendoo.HostActionRegistry): void {
    const timeout = actions.getById(wendoo.CoreActionId.Timeout);
    const ctx = newContext();
    const defaulted = timerFirings(timeout, ctx, 0, wendoo.NIL_VALUE);
    const notANumber = timerFirings(timeout, ctx, 1, wendoo.mkNumber(0 / 0));
    const text = timerFirings(timeout, ctx, 2, wendoo.mkString("1"));
    check(
      "timer-defaults-to-one-second-and-refuses-what-is-no-number",
      timeout !== undefined && sameNumbers(defaulted, [11]) && notANumber.length === 0 && text.length === 0
    );
  }

  /** How many times the random-number check reads the sensor. */
  const RANDOM_READS = 100;

  /**
   * The random-number sensor reads a number from 0 up to but not including
   * 1 every time, and not the same number every time.
   */
  function checkRandomReads(actions: wendoo.HostActionRegistry): void {
    const random = actions.getById(wendoo.CoreActionId.Random);
    const ctx = newContext();
    let inRange = random !== undefined;
    let varied = false;
    let first = -1;
    for (let i = 0; inRange && i < RANDOM_READS; i++) {
      const read = random.execSync(ctx, []);
      inRange = read.t === wendoo.ValueTag.Number && read.num >= 0 && read.num < 1;
      if (i === 0) {
        first = read.num;
      } else if (read.num !== first) {
        varied = true;
      }
    }
    check("random-reads-numbers-from-zero-up-to-one", inRange && varied);
  }

  /** A random-number stream drawing a fixed list of numbers, in order. */
  class QueuedRng extends wendoo.RngServices {
    private numbers: number[];
    private drawn: number;

    /** @param numbers - The numbers to draw, in order; each from 0 up to but not including 1. */
    constructor(numbers: number[]) {
      super();
      this.numbers = numbers;
      this.drawn = 0;
    }

    next(): number {
      const drawn = this.numbers[this.drawn];
      this.drawn++;
      return drawn;
    }
  }

  /** The numbers the random-number stream check hands the sensor, in order. */
  const QUEUED_RANDOM_NUMBERS = [0.5, 0, 0.75, 0.125];

  /**
   * The random-number sensor of core host actions registered with a
   * random-number stream reads that stream's numbers, in order.
   */
  function checkRandomReadsItsStream(): void {
    const actions = new wendoo.HostActionRegistry();
    wendoo.registerCoreHostActions(actions, new wendoo.F64Numerics(), new QueuedRng(QUEUED_RANDOM_NUMBERS));
    const random = actions.getById(wendoo.CoreActionId.Random);
    const ctx = newContext();
    const read: number[] = [];
    for (let i = 0; random && i < QUEUED_RANDOM_NUMBERS.length; i++) {
      read.push(random.execSync(ctx, []).num);
    }
    check("random-reads-the-stream-it-is-registered-with", sameNumbers(read, QUEUED_RANDOM_NUMBERS));
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
    check("debug-logging-defaults-off", !wendoo.debug);
    wendoo.debug = true;

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
    checkLateCoreTileIconIgnored();
    checkLateCoreTypeIconIgnored();
    checkWellFormedGrammars(ids, actions);
    checkIllFormedGrammars(ids);
    checkActionOutput();
    checkCoreTypedActionOutput();
    checkContextVariables(functions);
    checkCatalog();
    checkSlotBuilderLabels();
    checkLanguageBuilders();
    checkAccessorAndSensorFlagDefaults();
    checkAssetType(ids, types);
    checkCompiledBrains();
    checkLoader();
    checkProgramHost();
    checkFaultEvents();
    checkThrowingTile();
    checkThrowingPageHook();
    checkThrowingPageSwitch();
    checkTimerPagePingPong();
    checkTimerArguments(actions);
    checkRandomReads(actions);
    checkRandomReadsItsStream();
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
