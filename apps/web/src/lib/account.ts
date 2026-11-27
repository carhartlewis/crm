import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { request } from "./api-fetch.ts";
import { authClient } from "./auth.ts";
import { authKeys } from "./session.ts";
import { squareAvatar } from "./square-avatar.ts";

/** The longest name a person can save. */
export const NAME_MAX_LENGTH = 100;

/** Why a first name can't be saved, or undefined when it can. */
export function firstNameError(value: string) {
  const name = value.trim();

  if (!name) return "Enter your first name";

  if (name.length > NAME_MAX_LENGTH) return `Use ${NAME_MAX_LENGTH} characters or fewer`;

  return undefined;
}

/** A last name is optional. */
export function lastNameError(value: string) {
  return value.trim().length > NAME_MAX_LENGTH
    ? `Use ${NAME_MAX_LENGTH} characters or fewer`
    : undefined;
}

// The sidebar's account menu reads the session, so a new name or picture shows there too.
const refreshSession = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: authKeys.session() });

async function updateUser(changes: { name?: string; image?: string | null }) {
  const { error } = await authClient.updateUser(changes);

  if (error) throw new Error(error.message ?? "Couldn't save your profile");
}

export const updateNameMutation = mutationOptions({
  mutationKey: [...authKeys.all, "update-name"],
  mutationFn: (name: string) => updateUser({ name: name.trim() }),
  onSettled: (_data, _error, _variables, _result, { client }) => refreshSession(client),
});

/** Crops the picture to a square, stores it, then makes it the user's image. */
export const uploadAvatarMutation = mutationOptions({
  mutationKey: [...authKeys.all, "upload-avatar"],
  mutationFn: async (file: File) => {
    const image = await squareAvatar(file).catch(() => {
      throw new Error("Choose a PNG, JPEG or WebP image");
    });

    const { url } = await request<{ url: string }>("/api/account/avatar", {
      method: "POST",
      body: JSON.stringify({ image }),
    });

    await updateUser({ image: url });
  },
  onSettled: (_data, _error, _variables, _result, { client }) => refreshSession(client),
});

export const removeAvatarMutation = mutationOptions({
  mutationKey: [...authKeys.all, "remove-avatar"],
  mutationFn: () => updateUser({ image: null }),
  onSettled: (_data, _error, _variables, _result, { client }) => refreshSession(client),
});
