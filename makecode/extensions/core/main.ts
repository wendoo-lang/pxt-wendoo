/**
 * Wendoo for MakeCode Arcade.
 *
 * A brain is a collection of WHEN/DO rules compiled to Wendoo bytecode. This
 * extension executes that bytecode inside an Arcade game: one shared program
 * per brain asset, per-instance state for each spawned sprite, and a single
 * step budget shared by every instance per frame.
 *
 * Everything lives in this one namespace. MakeCode Static TypeScript has no
 * modules, so the VM, the brain asset class, the spawn block, and the tile
 * bind API are all declared here or in sibling files that reopen `wendoo`.
 */
namespace wendoo {}
