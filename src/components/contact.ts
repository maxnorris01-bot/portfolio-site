// The Contact form's words and its pure parts (the modal, ContactModal.tsx, only draws them).

export const CONTACT_LABEL = 'Contact'
export const CONTACT_TITLE = 'Contact Max'
export const CONTACT_NAME_LABEL = 'Your name'
export const CONTACT_EMAIL_LABEL = 'Your email'
export const CONTACT_MESSAGE_LABEL = 'Message'
export const CONTACT_NOTE = 'Your message goes straight to Max. Your email is only used to reply.'
export const CONTACT_SEND = 'Send'
export const CONTACT_SENDING = 'Sending…'
export const CONTACT_CLOSE = 'Close'
export const CONTACT_SENT = 'Message sent. Thank you.'

export const NAME_MAX = 100
export const EMAIL_MAX = 200
export const MESSAGE_MAX = 2000

export type ContactForm = { name: string; email: string; message: string; website: string }

export const emptyForm: ContactForm = { name: '', email: '', message: '', website: '' }

/** The live counter under the message box: "37 / 2,000". */
export const counterText = (length: number) => `${length.toLocaleString('en-US')} / ${MESSAGE_MAX.toLocaleString('en-US')}`

/** Send is on once the three fields hold something (the server judges the rest). */
export const canSend = (f: ContactForm) => f.name.trim() !== '' && f.email.trim() !== '' && f.message.trim() !== '' && f.message.length <= MESSAGE_MAX

/** What the visitor reads for each way the call can end (the codes are the server's; anything else is a plain failure). */
export function errorText(status: number): string {
  if (status === 503) return 'Contact is temporarily unavailable.'
  if (status === 429) return 'Too many messages from you for now. Please try again later.'
  if (status === 400) return 'Please check your name, email and message, then try again.'
  return 'Your message could not be sent. Please try again.'
}

/** Posts the form. Returns null on success, or the text to show (the typed text stays in the form). */
export async function sendContact(form: ContactForm, doFetch: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await doFetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (res.ok) return null
    return errorText(res.status)
  } catch {
    return errorText(0)
  }
}
