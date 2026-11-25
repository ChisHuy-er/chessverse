import { Injectable } from '@nestjs/common';

// Ghi nhận ai đang mở web (trình duyệt gửi "ping" mỗi phút).
// Lưu trong bộ nhớ: khởi động lại server thì mọi người tạm thành ngoại tuyến
// cho đến lần ping kế tiếp (tối đa 1 phút).
const ONLINE_WINDOW_MS = 2.5 * 60 * 1000;

@Injectable()
export class PresenceService {
  private readonly lastSeen = new Map<string, number>();

  touch(userId: string) {
    this.lastSeen.set(userId, Date.now());
  }

  isOnline(userId: string) {
    const at = this.lastSeen.get(userId);

    return at !== undefined && Date.now() - at < ONLINE_WINDOW_MS;
  }

  lastSeenAt(userId: string) {
    const at = this.lastSeen.get(userId);

    return at === undefined ? null : new Date(at).toISOString();
  }
}
