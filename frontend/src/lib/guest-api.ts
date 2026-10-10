// Guest API: no sign-in, so this module must not import anything from the auth code
import { request } from "@/lib/http"

export { ApiError } from "@/lib/http"

export type SharedItem = {
  itemId: string
  url: string
  title?: string
  note?: string
  claimed: boolean
  claimerName?: string
}

export type SharedList = {
  title: string
  description?: string
  items: SharedItem[]
}

const claimPath = (token: string, itemId: string) =>
  `/share/${encodeURIComponent(token)}/items/${encodeURIComponent(itemId)}/claim`

export const getSharedList = (token: string) =>
  request<SharedList>(`/share/${encodeURIComponent(token)}`)

export const claimItem = (token: string, itemId: string, claimerName: string) =>
  request<{ itemId: string; claimSecret: string }>(claimPath(token, itemId), {
    method: "POST",
    body: JSON.stringify({ claimerName }),
  })

export const unclaimItem = (token: string, itemId: string, claimSecret: string) =>
  request<void>(claimPath(token, itemId), {
    method: "DELETE",
    body: JSON.stringify({ claimSecret }),
  })
