import { db } from "../database";
import { ChatMessage, NewChatMessage } from "../types";

export async function findChatMessagesByMatchId(
  matchId: string
): Promise<ChatMessage[]> {
  return db
    .selectFrom("chat_messages")
    .where("match_id", "=", matchId)
    .selectAll()
    .orderBy("id", "asc")
    .execute();
}

export async function getChatHistory(matchId: string) {
  return db
    .selectFrom("chat_messages")
    .select(["sender", "display_name", "message", "created_at"])
    .where("match_id", "=", matchId)
    .orderBy("id", "asc")
    .execute();
}

export async function createChatMessage(msg: NewChatMessage): Promise<void> {
  await db.insertInto("chat_messages").values(msg).execute();
}
