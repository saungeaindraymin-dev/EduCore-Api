import bcrypt from "bcryptjs";

export const hash = (val: string) => bcrypt.hash(val, 12);
export const verify = (val: string, hashed: string) =>
  bcrypt.compare(val, hashed);
