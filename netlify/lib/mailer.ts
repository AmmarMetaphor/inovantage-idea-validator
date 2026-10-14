import { Resend } from 'resend';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export interface Mailer {
  send(message: MailMessage): Promise<{ providerMessageId: string }>;
}

export class ResendMailer implements Mailer {
  private resend: Resend;
  constructor(apiKey: string, private from: string, private replyTo?: string) {
    this.resend = new Resend(apiKey);
  }
  async send(message: MailMessage) {
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: [message.to],
      replyTo: this.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    });
    if (error || !data) throw new Error(`Resend: ${error?.message ?? 'no response'}`);
    return { providerMessageId: data.id };
  }
}

/** Test double: records messages instead of sending. */
export class MemoryMailer implements Mailer {
  sent: MailMessage[] = [];
  failNext: Error | null = null;
  async send(message: MailMessage) {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    this.sent.push(message);
    return { providerMessageId: `mem_${this.sent.length}` };
  }
}
