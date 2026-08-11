import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { GAME_SOUNDS } from '../audio/gameAudio'

describe('admin audio descriptions', () => {
  it.each(['es', 'en'])('describes every game sound in %s', (language) => {
    for (const sound of GAME_SOUNDS) {
      const description = i18n.getResource(
        language,
        'translation',
        `audio.contexts.${sound}`,
      )

      expect(description, sound).toEqual(expect.any(String))
      expect(description.trim(), sound).not.toBe('')
    }
  })
})
