/**
 * Songs as Wendoo values: the `Song` asset type a program names one of the
 * project's music-editor songs by, and the playable such a value names. A
 * value a program carries holds the song's asset id only; the song itself is
 * found when the value is played, as the project holds it then.
 */
namespace wendoo {
  /** Wendoo type name of a song value: a plain struct naming one of the project's songs by its asset id. */
  //% hidden
  export const TYPE_SONG = "Song";

  /** Asset kind of the project assets a `Song` value names. */
  //% hidden
  export const SONG_ASSET_KIND = "song";

  /**
   * The `Song` type's binding. Its atom id and its asset field's id are the
   * project's mapping's once the program host has drained registrations.
   */
  //% hidden
  export const songBinding = new AssetTypeBinding(SONG_ASSET_KIND);

  /**
   * A fresh Arcade playable of the song `value` names, made from the song
   * the project's song factory holds under its asset id at the moment this
   * is called. `undefined` when `value` is not a `Song` value, nil included,
   * or when no factory holds its asset id; the asset id is then reported
   * unresolved, once per id.
   *
   * @param value - Any value a program produced.
   */
  //% hidden
  export function songOf(value: Value): music.Playable {
    const assetId = songBinding.assetIdOf(value);
    if (assetId.length === 0) {
      return undefined;
    }
    const found: Buffer = helpers.getSongByName(assetId);
    if (!found) {
      songBinding.reportUnresolved(assetId);
      return undefined;
    }
    return music.createSong(found);
  }
}
