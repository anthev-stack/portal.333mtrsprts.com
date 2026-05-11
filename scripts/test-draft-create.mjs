import "dotenv/config";
import { PrismaClient, MessageStatus } from "@prisma/client";

const p = new PrismaClient();
const u = await p.user.findFirst();
if (!u) process.exit(1);
try {
  const m = await p.internalMessage.create({
    data: {
      subject: "draft test",
      body: "<p>x</p>",
      senderId: u.id,
      status: MessageStatus.DRAFT,
      sentAt: null,
    },
  });
  console.log("ok no recipients", m.id);
  await p.internalMessage.delete({ where: { id: m.id } });
} catch (e) {
  console.error(e);
} finally {
  await p.$disconnect();
}
