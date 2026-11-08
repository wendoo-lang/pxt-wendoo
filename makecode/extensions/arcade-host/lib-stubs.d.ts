// Editor-only global type stubs. This project typechecks with noLib, the
// same world the pxt compiler uses, where pxt_modules/base declares the
// globals. Modern TypeScript additionally requires these two global types,
// which pxt's core declarations predate. Not listed in pxt.json "files",
// so the pxt compiler never reads this file.
// biome-ignore lint/complexity/noBannedTypes: TypeScript resolves this global as a function type.
interface CallableFunction extends Function {}
// biome-ignore lint/complexity/noBannedTypes: TypeScript resolves this global as a function type.
interface NewableFunction extends Function {}
