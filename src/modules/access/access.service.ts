import { prisma } from "@/db";
import type { JwtPayload } from "@/utils/jwt";
import { httpError } from "@/utils/errors";
import { NAVIGATION, ROLE_PERMISSIONS, hasPermission } from "./access.config";

export async function getAccess(actor: JwtPayload) {
  const user = await prisma.user.findUnique({
    where: { id: actor.sub },
    select: { role: true, status: true },
  });
  if (!user || user.status === "inactive" || user.role !== actor.role) {
    throw httpError(401, "Your session is out of date. Please sign in again.");
  }

  const navigation = NAVIGATION[user.role]
    .filter((item) => hasPermission(user.role, item.permission))
    .map(({ permission: _permission, ...item }) => item);

  return {
    role: user.role,
    permissions: [...ROLE_PERMISSIONS[user.role]],
    navigation,
  };
}
