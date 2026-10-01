import {api} from './api-client.js';

// Only actual input schedules a write. Status polling and lease renewals never extend a session.
export class SessionActivity {
  constructor() {
    this.active = false;
    this.generation = 0;
    this.lastSentAt = 0;
    this.events = ['pointerdown','keydown','input','scroll'];
    this.events.forEach(name => document.addEventListener(name,event => this.interact(event),{capture:true,passive:name === 'scroll'}));
    window.addEventListener('session-updated',event => this.accept(event.detail));
    document.addEventListener('visibilitychange',() => { if (!document.hidden) this.check(); });
  }

  accept({session,route}) {
    if (!session || !Number.isFinite(session.expiresAt) || !Number.isFinite(session.serverTime)) return;
    const now = Date.now();
    const timeout = Number(session.idleTimeoutSeconds) * 1000;
    const deadline = now + Math.max(0,session.expiresAt - session.serverTime) * 1000;
    if (!this.active) {
      this.active = true;
      this.timeout = timeout;
      this.lastActivityAt = deadline - timeout;
      this.expiryTimer = setInterval(() => this.check(),1000);
      this.pollTimer = setInterval(() => this.poll(),30000);
    } else if (route !== '/auth/activity' && this.serverExpiry !== session.expiresAt) {
      // Activity in another tab of this same browser is reflected by the server expiry.
      this.lastActivityAt = Math.max(this.lastActivityAt,deadline - timeout);
    }
    this.serverExpiry = session.expiresAt;
    this.serverDeadline = deadline;
    this.check();
  }

  interact(event) {
    if (!event.isTrusted || !this.active) return;
    if (!this.check()) {
      if (event.cancelable && event.type !== 'scroll') event.preventDefault();
      if (event.type !== 'scroll') event.stopImmediatePropagation();
      return;
    }
    this.lastActivityAt = Date.now();
    this.pendingActivity = true;
    if (this.sending || this.activityTimer) return;
    const delay = Math.max(0,15000 - (Date.now() - this.lastSentAt));
    if (!delay) void this.sendActivity();
    else this.activityTimer = setTimeout(() => { this.activityTimer = null; void this.sendActivity(); },delay);
  }

  async sendActivity() {
    if (!this.active || !this.pendingActivity || this.sending || !this.check()) return;
    this.pendingActivity = false;
    this.sending = true;
    this.lastSentAt = Date.now();
    const generation = this.generation;
    try { await api.post('/auth/activity'); }
    catch (error) { if (error.status === 401) this.expire('revoked'); }
    finally {
      if (generation !== this.generation) return;
      this.sending = false;
      if (this.active && this.pendingActivity && !this.activityTimer) {
        this.activityTimer = setTimeout(() => { this.activityTimer = null; void this.sendActivity(); },15000);
      }
    }
  }

  async poll() {
    if (!this.check() || this.polling) return;
    this.polling = true;
    const generation = this.generation;
    try { await api.get('/auth/session'); }
    catch (error) { if (error.status === 401) this.expire('revoked'); }
    finally { if (generation === this.generation) this.polling = false; }
  }

  check() {
    if (!this.active || this.confirming) return false;
    if (Date.now() >= Math.min(this.serverDeadline,this.lastActivityAt + this.timeout)) {
      void this.confirmExpiry(); return false;
    }
    return true;
  }

  async confirmExpiry() {
    if (!this.active || this.confirming) return;
    this.confirming = true;
    this.pendingActivity = false;
    clearTimeout(this.activityTimer); this.activityTimer = null;
    window.dispatchEvent(new CustomEvent('session-checking',{detail:{checking:true}}));
    const generation = this.generation;
    const controller = new AbortController();
    this.confirmationController = controller;
    const timer = setTimeout(() => controller.abort(),3000);
    try {
      const result = await api.get('/auth/session',{signal:controller.signal});
      if (!this.active || generation !== this.generation) return;
      if (!result.session || result.session.expiresAt <= result.session.serverTime || this.serverDeadline <= Date.now()) {
        this.expire('idle'); return;
      }
      // Another tab may have extended the shared session since our last status poll.
      this.lastActivityAt = Math.max(this.lastActivityAt,this.serverDeadline - this.timeout);
    } catch {
      // A failed read is grounds to hide this tab, never to revoke another active tab.
      if (this.active && generation === this.generation) this.expire('idle');
    } finally {
      clearTimeout(timer);
      if (generation === this.generation) {
        this.confirming = false;
        this.confirmationController = null;
        window.dispatchEvent(new CustomEvent('session-checking',{detail:{checking:false}}));
      }
    }
  }

  expire(reason) {
    if (!this.active) return;
    this.stop();
    window.dispatchEvent(new CustomEvent('session-expired',{detail:{reason}}));
  }

  stop() {
    this.generation += 1;
    this.active = false;
    clearInterval(this.expiryTimer); clearInterval(this.pollTimer); clearTimeout(this.activityTimer);
    this.activityTimer = null; this.pendingActivity = false; this.serverExpiry = null;
    this.lastSentAt = 0;
    this.sending = false; this.polling = false;
    this.confirmationController?.abort(); this.confirmationController = null; this.confirming = false;
    window.dispatchEvent(new CustomEvent('session-checking',{detail:{checking:false}}));
  }
}
