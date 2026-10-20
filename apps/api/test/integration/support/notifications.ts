import type { Client } from 'pg';

export interface NotificationRow {
  user_id: string;
  count: number;
  params: Record<string, unknown>;
}

/** The in-app notifications of a template key, optionally for one person. */
export async function notificationsOf(
  db: Client,
  key: string,
  userId?: string,
): Promise<NotificationRow[]> {
  const { rows } = await db.query<NotificationRow>(
    `SELECT user_id, count, params FROM notifications
      WHERE template_key = $1 AND ($2::uuid IS NULL OR user_id = $2::uuid)
      ORDER BY created_at`,
    [key, userId ?? null],
  );
  return rows;
}
