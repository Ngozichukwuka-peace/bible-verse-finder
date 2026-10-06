/**
 * Read-aloud via the Web Speech API. No dependency, but it is not available
 * everywhere, so every entry point here degrades quietly.
 */

let voices: SpeechSynthesisVoice[] = []

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const current = speechSynthesis.getVoices()
  if (current.length > 0) voices = current
  return voices
}

export function speechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function englishVoices(): SpeechSynthesisVoice[] {
  const all = loadVoices()
  const matching = all.filter((v) => v.lang.toLowerCase().startsWith('en'))
  return matching.length > 0 ? matching : all
}

export interface SpeakOptions {
  text: string
  rate?: number
  voiceURI?: string | null
}

export function speak({ text, rate = 0.95, voiceURI }: SpeakOptions): void {
  if (!speechSupported()) return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = rate
  utterance.lang = 'en-US'
  const voice = englishVoices().find((v) => v.voiceURI === voiceURI)
  if (voice) utterance.voice = voice
  speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (speechSupported()) speechSynthesis.cancel()
}

export function isSpeaking(): boolean {
  return speechSupported() && speechSynthesis.speaking
}
