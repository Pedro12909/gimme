import { Hono } from "hono";
import {
  ApiGatewayRequestContextV2,
  handle,
  LambdaContext,
} from "hono/aws-lambda";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type BatchGetCommandOutput,
  type BatchWriteCommandInput,
  type BatchWriteCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import * as crypto from "node:crypto";
import {
  backfillPositions,
  compareItems,
  positionAfter,
} from "../shared/item-order";
import { MAX_ITEMS_PER_LIST, MAX_LISTS_PER_OWNER } from "../shared/limits";
import { copyImage, createUpload, deleteImages, publishUpload } from "./images";
import { isCleared, readItemInput } from "./item-input";

type Bindings = {
  requestContext: ApiGatewayRequestContextV2;
  lambdaContext: LambdaContext;
};

type Variables = {
  userId: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const dbClient = new DynamoDBClient();
const documentClient = DynamoDBDocumentClient.from(dbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const listsTableName = process.env["LISTS_TABLE_NAME"];
const itemsTableName = process.env["ITEMS_TABLE_NAME"];
const ownersTableName = process.env["OWNERS_TABLE_NAME"];

const LIMITS = {
  listTitle: 100,
  description: 500,
  displayName: 40,
};

const readBody = async (req: {
  json: () => Promise<unknown>;
}): Promise<Record<string, unknown> | null> => {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

// Each check returns an error message, or undefined when the value is acceptable
const checkText = (
  value: unknown,
  field: string,
  max: number,
  required = false,
) => {
  if (value === undefined) {
    return required ? `${field} is required` : undefined;
  }
  if (typeof value !== "string") {
    return `${field} must be a string`;
  }
  if (required && value.trim() === "") {
    return `${field} is required`;
  }
  if (value.length > max) {
    return `${field} must be at most ${max} characters`;
  }
  return undefined;
};

// imageUpload names a pending upload to attach. Absent or "" means no new photo.
const readImageUpload = (body: Record<string, unknown>) =>
  typeof body.imageUpload === "string" && body.imageUpload !== ""
    ? body.imageUpload
    : undefined;

const UPLOAD_NOT_FOUND =
  "The photo didn't finish uploading. Try adding it again.";

// An optional calendar day for the occasion, "2026-12-25". Only the day matters, so it's kept
// as plain text with no time zone. On update, "" clears it.
const checkEventDate = (value: unknown, allowEmpty: boolean) => {
  if (value === undefined || (allowEmpty && value === "")) {
    return undefined;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "eventDate must be a date like 2026-12-25";
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return "eventDate must be a real date";
  }
  return undefined;
};

// A private list is the owner's own tracker: its share link stops working until it's shared again
const checkPrivate = (value: unknown) =>
  value === undefined || typeof value === "boolean"
    ? undefined
    : "isPrivate must be true or false";

// How many thumbnails the lists screen shows for each list
const LIST_PREVIEW_IMAGES = 3;

// Every owner always has at least one list, and exactly one of them has isDefault: the list
// the app opens on (design/home-redesign.md, section 2). A new owner gets this one.
const FIRST_LIST_TITLE = "Wishlist";

type Row = Record<string, unknown>;

const oldestFirst = (a: Row, b: Row) =>
  String(a.createdAt).localeCompare(String(b.createdAt));

const newList = (
  ownerId: string,
  fields: {
    title: unknown;
    description?: unknown;
    eventDate?: unknown;
    isPrivate?: unknown;
  },
  listId: string = crypto.randomUUID(),
) => ({
  listId,
  ownerId,
  title: fields.title,
  description: fields.description,
  eventDate: fields.eventDate || undefined,
  isPrivate: fields.isPrivate === true || undefined,
  isDefault: false,
  shareToken: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
});

// The first list's id comes from the owner's id, so two first requests at once make one list
const firstListId = (ownerId: string) => {
  const hex = crypto
    .createHash("sha256")
    .update(`default#${ownerId}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

// The owner's lists, oldest first. The index finds them (one made a moment ago may be
// missing); each is then read from the table itself, so isDefault is never stale.
async function ownerLists(ownerId: string): Promise<Row[]> {
  const found = await documentClient.send(
    new QueryCommand({
      TableName: listsTableName,
      IndexName: "OwnerIndex",
      KeyConditionExpression: "ownerId = :ownerId",
      ExpressionAttributeValues: { ":ownerId": ownerId },
      ProjectionExpression: "listId",
    }),
  );
  const keys = (found.Items ?? []).map((list) => ({ listId: list.listId }));
  if (keys.length === 0) return [];

  // An owner has at most MAX_LISTS_PER_OWNER lists, well under one batch of 100
  const lists: Row[] = [];
  let pending: Record<string, unknown>[] | undefined = keys;
  while (pending && pending.length > 0) {
    const result: BatchGetCommandOutput = await documentClient.send(
      new BatchGetCommand({
        RequestItems: {
          [listsTableName!]: { Keys: pending, ConsistentRead: true },
        },
      }),
    );
    lists.push(...(result.Responses?.[listsTableName!] ?? []));
    pending = result.UnprocessedKeys?.[listsTableName!]?.Keys;
  }
  return lists.filter((list) => list.ownerId === ownerId).sort(oldestFirst);
}

// The list that becomes the default when the default is deleted: the oldest one left.
// Kept on its own so the rule is easy to change (it's still a proposal).
const nextDefault = (remaining: Row[]) => [...remaining].sort(oldestFirst)[0];

// Returns the owner's lists with exactly one default, fixing things up first if needed:
// - no lists (a new owner): makes "Wishlist" as the default
// - lists but no default (accounts from before defaults): the oldest becomes it
// - more than one default (shouldn't happen): the oldest of them stays default
// Lazy, so it works however the Cognito user was made.
async function ensureDefaultList(ownerId: string): Promise<Row[]> {
  const lists = await ownerLists(ownerId);

  if (lists.length === 0) {
    const first = {
      ...newList(
        ownerId,
        { title: FIRST_LIST_TITLE, description: "" },
        firstListId(ownerId),
      ),
      isDefault: true,
    };
    try {
      await documentClient.send(
        new PutCommand({
          TableName: listsTableName,
          Item: first,
          ConditionExpression: "attribute_not_exists(listId)",
        }),
      );
      return [first];
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
      // Another request made it a moment ago
      const existing = await documentClient.send(
        new GetCommand({
          TableName: listsTableName,
          Key: { listId: first.listId },
          ConsistentRead: true,
        }),
      );
      return existing.Item?.ownerId === ownerId ? [existing.Item] : [];
    }
  }

  const defaults = lists.filter((list) => list.isDefault === true);
  if (defaults.length === 1) return lists;

  const keep = defaults[0] ?? lists[0];
  await Promise.all(
    lists
      .filter((list) => (list === keep) !== (list.isDefault === true))
      .map((list) =>
        documentClient.send(
          new UpdateCommand({
            TableName: listsTableName,
            Key: { listId: list.listId },
            UpdateExpression: "SET isDefault = :isDefault",
            ConditionExpression: "ownerId = :ownerId",
            ExpressionAttributeValues: {
              ":isDefault": list === keep,
              ":ownerId": ownerId,
            },
          }),
        ),
      ),
  );
  return lists.map((list) => ({ ...list, isDefault: list === keep }));
}

// The owner's items in batches of 25, the most one write request takes
async function deleteItems(listId: string, itemIds: string[]) {
  for (let start = 0; start < itemIds.length; start += 25) {
    let pending: BatchWriteCommandInput["RequestItems"] = {
      [itemsTableName!]: itemIds.slice(start, start + 25).map((itemId) => ({
        DeleteRequest: { Key: { listId, itemId } },
      })),
    };
    for (
      let attempt = 0;
      pending && Object.keys(pending).length > 0;
      attempt++
    ) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
      }
      const result: BatchWriteCommandOutput = await documentClient.send(
        new BatchWriteCommand({ RequestItems: pending }),
      );
      pending = result.UnprocessedItems;
      if (attempt >= 5 && pending && Object.keys(pending).length > 0) {
        throw new Error("Couldn't delete every item");
      }
    }
  }
}

// Middleware
app.use("*", async (ctx, next) => {
  const sub = ctx.env.requestContext.authorizer.jwt?.claims.sub;

  if (!sub) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  ctx.set("userId", sub as string);

  return next();
});

// The owner's own details. Guests see the display name on every shared list ("Pedro's list").
app.get("/me", async (ctx) => {
  const owner = await documentClient.send(
    new GetCommand({
      TableName: ownersTableName,
      Key: { ownerId: ctx.get("userId") },
    }),
  );

  return ctx.json({ displayName: owner.Item?.displayName });
});

// An empty displayName removes it. Only that attribute changes, so other details stay.
app.patch("/me", async (ctx) => {
  const body = await readBody(ctx.req);
  if (!body) {
    return ctx.json({ error: "Invalid JSON body" }, 400);
  }

  const error =
    checkText(body.displayName, "displayName", LIMITS.displayName) ??
    (body.displayName === undefined ? "displayName is required" : undefined);
  if (error) {
    return ctx.json({ error }, 400);
  }

  const displayName = (body.displayName as string).trim();
  await documentClient.send(
    new UpdateCommand({
      TableName: ownersTableName,
      Key: { ownerId: ctx.get("userId") },
      ...(displayName === ""
        ? { UpdateExpression: "REMOVE displayName" }
        : {
            UpdateExpression: "SET displayName = :displayName",
            ExpressionAttributeValues: { ":displayName": displayName },
          }),
    }),
  );

  return ctx.json({ displayName: displayName || undefined });
});

app.post("/lists", async (ctx) => {
  const body = await readBody(ctx.req);
  if (!body) {
    return ctx.json({ error: "Invalid JSON body" }, 400);
  }

  const { title, description, eventDate, isPrivate } = body;
  const error =
    checkText(title, "title", LIMITS.listTitle, true) ??
    checkText(description, "description", LIMITS.description) ??
    checkEventDate(eventDate, true) ??
    checkPrivate(isPrivate);
  if (error) {
    return ctx.json({ error }, 400);
  }

  const ownerId = ctx.get("userId");

  // The index can lag a moment behind, so two creates at the same instant could both pass.
  // That's an acceptable overshoot for a cap that exists to bound storage.
  const countResult = await documentClient.send(
    new QueryCommand({
      TableName: listsTableName,
      IndexName: "OwnerIndex",
      KeyConditionExpression: "ownerId = :ownerId",
      ExpressionAttributeValues: { ":ownerId": ownerId },
      Select: "COUNT",
    }),
  );
  if ((countResult.Count ?? 0) >= MAX_LISTS_PER_OWNER) {
    return ctx.json(
      { error: `You can have at most ${MAX_LISTS_PER_OWNER} lists` },
      409,
    );
  }

  const list = newList(ownerId, { title, description, eventDate, isPrivate });

  await documentClient.send(
    new PutCommand({
      TableName: listsTableName,
      Item: list,
    }),
  );

  return ctx.json(list, 201);
});

// Every item in one list, in the owner's ranking
async function listItems(listId: string, projection?: string) {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: itemsTableName,
      KeyConditionExpression: "listId = :listId",
      ExpressionAttributeValues: { ":listId": listId },
      ...(projection && { ProjectionExpression: projection }),
      ...(projection?.includes("#position") && {
        ExpressionAttributeNames: { "#position": "position" },
      }),
    }),
  );
  return (result.Items ?? []).sort(compareItems);
}

// The sidebar: every list with its counts, oldest first, and which one is the default.
// Also how a new owner gets their first list (ensureDefaultList).
app.get("/lists", async (ctx) => {
  const lists = await ensureDefaultList(ctx.get("userId"));

  // One small query per list: owners have a handful of lists, and only the fields needed
  // for the counts and photos are read
  const withCounts = await Promise.all(
    lists.map(async (list) => {
      const items = await listItems(
        String(list.listId),
        "itemId, #position, createdAt, imageUrl, starred, got",
      );
      return {
        ...list,
        itemCount: items.length,
        starredCount: items.filter((item) => item.starred === true).length,
        gotCount: items.filter((item) => item.got === true).length,
        previewImages: items
          .map((item) => item.imageUrl)
          .filter((url): url is string => typeof url === "string")
          .slice(0, LIST_PREVIEW_IMAGES),
      };
    }),
  );

  return ctx.json({
    defaultListId: lists.find((list) => list.isDefault === true)?.listId,
    lists: withCounts,
  });
});

const VIEWS = {
  all: () => true,
  want: (item: Row) => item.starred === true,
  got: (item: Row) => item.got === true,
};

// The views across every list: All items, Want most, Got it. Read-only; each item keeps its
// listId, and they come list by list (oldest list first), each in its own ranking.
app.get("/items", async (ctx) => {
  const view = ctx.req.query("view") ?? "all";
  if (!(view in VIEWS)) {
    return ctx.json({ error: "view must be all, want or got" }, 400);
  }

  const lists = await ownerLists(ctx.get("userId"));
  const items = (
    await Promise.all(lists.map((list) => listItems(String(list.listId))))
  ).flat();

  return ctx.json(items.filter(VIEWS[view as keyof typeof VIEWS]));
});

app.get("/lists/:listId", async (ctx) => {
  const listId = ctx.req.param("listId");
  const userId = ctx.get("userId");

  const listResult = await documentClient.send(
    new GetCommand({
      TableName: listsTableName,
      Key: { listId },
    }),
  );

  if (!listResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }
  if (listResult.Item.ownerId !== userId) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const itemsResult = await documentClient.send(
    new QueryCommand({
      TableName: itemsTableName,
      KeyConditionExpression: "listId = :listId",
      ExpressionAttributeValues: { ":listId": listId },
    }),
  );

  const items = (itemsResult.Items ?? []).sort(compareItems);

  // Items saved before ranking existed get positions once, keeping their current order
  const backfill = backfillPositions(items);
  await Promise.all(
    backfill.map(async ({ item, position }) => {
      try {
        await documentClient.send(
          new UpdateCommand({
            TableName: itemsTableName,
            Key: { listId, itemId: item.itemId },
            ConditionExpression:
              "attribute_exists(itemId) AND attribute_not_exists(#position)",
            UpdateExpression: "SET #position = :position",
            ExpressionAttributeNames: { "#position": "position" },
            ExpressionAttributeValues: { ":position": position },
          }),
        );
        item.position = position;
      } catch (err) {
        // Deleted or ranked by another request in the meantime; its order is still correct
        if (!(err instanceof ConditionalCheckFailedException)) throw err;
      }
    }),
  );

  return ctx.json({
    ...listResult.Item,
    isDefault: listResult.Item.isDefault === true,
    items,
  });
});

app.patch("/lists/:listId", async (ctx) => {
  const listId = ctx.req.param("listId");
  const userId = ctx.get("userId");
  const body = await readBody(ctx.req);
  if (!body) {
    return ctx.json({ error: "Invalid JSON body" }, 400);
  }

  const { title, description, eventDate, isPrivate, isDefault } = body;
  const error =
    checkText(title, "title", LIMITS.listTitle, title !== undefined) ??
    checkText(description, "description", LIMITS.description) ??
    checkEventDate(eventDate, true) ??
    checkPrivate(isPrivate) ??
    // There's always exactly one default, so it moves by making another list the default
    (isDefault !== undefined && isDefault !== true
      ? "isDefault can only be true: make another list the default instead"
      : undefined);
  if (error) {
    return ctx.json({ error }, 400);
  }

  const listResult = await documentClient.send(
    new GetCommand({
      TableName: listsTableName,
      Key: { listId },
    }),
  );

  if (!listResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }
  if (listResult.Item.ownerId !== userId) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const updates: string[] = [];
  const removes: string[] = [];
  const values: Record<string, unknown> = { ":ownerId": userId };

  if (title !== undefined) {
    updates.push("title = :title");
    values[":title"] = title;
  }
  if (description !== undefined) {
    updates.push("description = :description");
    values[":description"] = description;
  }
  if (eventDate === "") {
    removes.push("eventDate");
  } else if (eventDate !== undefined) {
    updates.push("eventDate = :eventDate");
    values[":eventDate"] = eventDate;
  }
  if (isPrivate === true) {
    updates.push("isPrivate = :isPrivate");
    values[":isPrivate"] = true;
  } else if (isPrivate === false) {
    removes.push("isPrivate");
  }

  if (updates.length === 0 && removes.length === 0 && isDefault !== true) {
    return ctx.json({ error: "Nothing to update" }, 400);
  }

  // "Open this list first": this list becomes the default and the old one stops being it,
  // in one transaction so there's never zero or two
  if (isDefault === true && listResult.Item.isDefault !== true) {
    const previous = (await ownerLists(userId)).filter(
      (list) => list.isDefault === true && list.listId !== listId,
    );
    try {
      await documentClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: listsTableName,
                Key: { listId },
                UpdateExpression: "SET isDefault = :true",
                ConditionExpression: "ownerId = :ownerId",
                ExpressionAttributeValues: {
                  ":true": true,
                  ":ownerId": userId,
                },
              },
            },
            ...previous.map((list) => ({
              Update: {
                TableName: listsTableName,
                Key: { listId: list.listId },
                UpdateExpression: "SET isDefault = :false",
                ConditionExpression: "isDefault = :true AND ownerId = :ownerId",
                ExpressionAttributeValues: {
                  ":true": true,
                  ":false": false,
                  ":ownerId": userId,
                },
              },
            })),
          ],
        }),
      );
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        return ctx.json(
          { error: "Your lists changed meanwhile. Try again." },
          409,
        );
      }
      throw err;
    }
  }

  if (updates.length === 0 && removes.length === 0) {
    return ctx.json({ ...listResult.Item, isDefault: true });
  }

  const updateExpression = [
    updates.length > 0 ? `SET ${updates.join(", ")}` : "",
    removes.length > 0 ? `REMOVE ${removes.join(", ")}` : "",
  ]
    .join(" ")
    .trim();

  const result = await documentClient.send(
    new UpdateCommand({
      TableName: listsTableName,
      Key: { listId },
      ConditionExpression: "ownerId = :ownerId",
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );

  return ctx.json({
    ...result.Attributes,
    isDefault: result.Attributes?.isDefault === true,
  });
});

app.delete("/lists/:listId", async (ctx) => {
  const listId = ctx.req.param("listId");
  const userId = ctx.get("userId");

  const listResult = await documentClient.send(
    new GetCommand({
      TableName: listsTableName,
      Key: { listId },
    }),
  );

  if (!listResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }
  if (listResult.Item.ownerId !== userId) {
    return ctx.json({ error: "Not found" }, 404);
  }

  // The last list stays, so the app always has one to open on
  const lists = await ownerLists(userId);
  const remaining = lists.filter((list) => list.listId !== listId);
  if (remaining.length === 0) {
    return ctx.json(
      { code: "LAST_LIST", error: "Your only list can't be deleted" },
      409,
    );
  }

  const items = await listItems(listId, "itemId, imageKey");
  await deleteItems(
    listId,
    items.map((item) => String(item.itemId)),
  );
  await deleteImages(items.map((item) => item.imageKey));

  // Deleting the default hands it on (nextDefault), in the same write as the delete
  const wasDefault =
    (lists.find((list) => list.listId === listId) ?? listResult.Item)
      .isDefault === true;
  const promoted = wasDefault ? nextDefault(remaining) : undefined;
  await documentClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: listsTableName,
            Key: { listId },
            ConditionExpression: "ownerId = :ownerId",
            ExpressionAttributeValues: { ":ownerId": userId },
          },
        },
        ...(promoted
          ? [
              {
                Update: {
                  TableName: listsTableName,
                  Key: { listId: promoted.listId },
                  UpdateExpression: "SET isDefault = :true",
                  ConditionExpression: "ownerId = :ownerId",
                  ExpressionAttributeValues: {
                    ":true": true,
                    ":ownerId": userId,
                  },
                },
              },
            ]
          : []),
      ],
    }),
  );

  return ctx.body(null, 204);
});

app.post("/lists/:listId/items", async (ctx) => {
  const listId = ctx.req.param("listId");
  const userId = ctx.get("userId");

  const listResult = await documentClient.send(
    new GetCommand({
      TableName: listsTableName,
      Key: { listId },
    }),
  );

  if (!listResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }
  if (listResult.Item.ownerId !== userId) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const body = await readBody(ctx.req);
  if (!body) {
    return ctx.json({ error: "Invalid JSON body" }, 400);
  }

  const input = readItemInput(body, "create");
  if ("error" in input) {
    return ctx.json({ error: input.error }, 400);
  }

  // New items go to the bottom of the owner's ranking
  const positionsResult = await documentClient.send(
    new QueryCommand({
      TableName: itemsTableName,
      KeyConditionExpression: "listId = :listId",
      ProjectionExpression: "#position",
      ExpressionAttributeNames: { "#position": "position" },
      ExpressionAttributeValues: { ":listId": listId },
    }),
  );

  // The positions query already returns every item, so it doubles as the count
  if ((positionsResult.Items ?? []).length >= MAX_ITEMS_PER_LIST) {
    return ctx.json(
      { error: `A list can have at most ${MAX_ITEMS_PER_LIST} items` },
      409,
    );
  }

  // An uploaded photo replaces any image link sent with it
  const upload = readImageUpload(body);
  const image = upload && (await publishUpload(listId, upload, userId));
  if (upload && !image) {
    return ctx.json({ error: UPLOAD_NOT_FOUND }, 400);
  }

  // Empty optional fields are left out rather than stored as ""
  const fields = Object.fromEntries(
    Object.entries(input.fields).filter(([, value]) => !isCleared(value)),
  );

  const item = {
    ...fields,
    ...image,
    listId,
    itemId: crypto.randomUUID(),
    position: positionAfter(positionsResult.Items ?? []),
    createdAt: new Date().toISOString(),
  };

  await documentClient.send(
    new PutCommand({
      TableName: itemsTableName,
      Item: item,
    }),
  );

  return ctx.json(item, 201);
});

// Copies an item to another of the owner's lists, at the bottom of its order. There's no
// move: the original stays where it is, so a guest's claim on it is never undone without
// anyone knowing. The copy starts unclaimed.
app.post("/lists/:listId/items/:itemId/copy", async (ctx) => {
  const listId = ctx.req.param("listId");
  const itemId = ctx.req.param("itemId");
  const userId = ctx.get("userId");

  const body = await readBody(ctx.req);
  const to = body?.to;
  if (typeof to !== "string" || to === "") {
    return ctx.json({ error: "to must be a list id" }, 400);
  }
  if (to === listId) {
    return ctx.json({ error: "Pick another list to copy it to" }, 400);
  }

  const [source, target, existing] = await Promise.all([
    documentClient.send(
      new GetCommand({
        TableName: listsTableName,
        Key: { listId },
        ProjectionExpression: "ownerId",
      }),
    ),
    documentClient.send(
      new GetCommand({
        TableName: listsTableName,
        Key: { listId: to },
        ProjectionExpression: "ownerId",
      }),
    ),
    documentClient.send(
      new GetCommand({ TableName: itemsTableName, Key: { listId, itemId } }),
    ),
  ]);
  // Both lists must be this owner's
  if (
    source.Item?.ownerId !== userId ||
    target.Item?.ownerId !== userId ||
    !existing.Item
  ) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const positions = await listItems(to, "#position");
  if (positions.length >= MAX_ITEMS_PER_LIST) {
    return ctx.json(
      { error: `A list can have at most ${MAX_ITEMS_PER_LIST} items` },
      409,
    );
  }

  const {
    imageKey,
    imageUrl,
    listId: _list,
    itemId: _item,
    position: _position,
    createdAt: _created,
    ...fields
  } = existing.Item;
  // An uploaded photo is copied too; a shop's photo link can simply be shared
  const image =
    typeof imageKey === "string"
      ? await copyImage(imageKey, userId, to)
      : { imageUrl };

  const copy = {
    ...fields,
    ...image,
    listId: to,
    itemId: crypto.randomUUID(),
    position: positionAfter(positions),
    createdAt: new Date().toISOString(),
  };
  await documentClient.send(
    new PutCommand({ TableName: itemsTableName, Item: copy }),
  );

  return ctx.json(copy, 201);
});

app.patch("/lists/:listId/items/:itemId", async (ctx) => {
  const listId = ctx.req.param("listId");
  const itemId = ctx.req.param("itemId");
  const userId = ctx.get("userId");

  const listResult = await documentClient.send(
    new GetCommand({
      TableName: listsTableName,
      Key: { listId },
    }),
  );

  if (!listResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }
  if (listResult.Item.ownerId !== userId) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const body = await readBody(ctx.req);
  if (!body) {
    return ctx.json({ error: "Invalid JSON body" }, 400);
  }

  const input = readItemInput(body, "update");
  if ("error" in input) {
    return ctx.json({ error: input.error }, 400);
  }

  const existingResult = await documentClient.send(
    new GetCommand({
      TableName: itemsTableName,
      Key: { listId, itemId },
    }),
  );
  const existing = existingResult.Item;
  if (!existing) {
    return ctx.json({ error: "Not found" }, 404);
  }

  // An item keeps a name or a link (or both): clearing one needs the other
  const keeps = (field: "title" | "url") =>
    field in input.fields
      ? !isCleared(input.fields[field])
      : Boolean(existing[field]);
  if (!keeps("title") && !keeps("url")) {
    return ctx.json({ error: "title or url is required" }, 400);
  }

  // imageKey is only ever set here, from an upload, so it always names a file this app owns
  const fields: Record<string, unknown> = { ...input.fields };
  let replacedImageKey: string | undefined;

  const upload = readImageUpload(body);
  if (upload) {
    const image = await publishUpload(listId, upload, userId);
    if (!image) {
      return ctx.json({ error: UPLOAD_NOT_FOUND }, 400);
    }
    Object.assign(fields, image);
    replacedImageKey = existing.imageKey;
  } else if (
    existing.imageKey &&
    fields.imageUrl !== undefined &&
    fields.imageUrl !== existing.imageUrl
  ) {
    // The uploaded photo was removed or swapped for a shop image
    fields.imageKey = "";
    replacedImageKey = existing.imageKey;
  }

  const sets: string[] = [];
  const removes: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(fields)) {
    // Attribute names go through placeholders, since words like "url" and "size" clash with DynamoDB reserved words
    names[`#${field}`] = field;

    // Clearing an optional field removes it rather than storing "" or [] (url is never empty here)
    if (isCleared(value)) {
      removes.push(`#${field}`);
    } else {
      sets.push(`#${field} = :${field}`);
      values[`:${field}`] = value;
    }
  }

  if (sets.length === 0 && removes.length === 0) {
    return ctx.json({ error: "Nothing to update" }, 400);
  }

  const updateExpression = [
    sets.length > 0 ? `SET ${sets.join(", ")}` : "",
    removes.length > 0 ? `REMOVE ${removes.join(", ")}` : "",
  ]
    .join(" ")
    .trim();

  // Checked again in the write, in case another save cleared the other one meanwhile
  const guards: string[] = [];
  if (fields.title === "" && !("url" in fields && fields.url !== "")) {
    names["#url"] = "url";
    guards.push("attribute_exists(#url)");
  }
  if (fields.url === "" && !("title" in fields && fields.title !== "")) {
    names["#title"] = "title";
    guards.push("attribute_exists(#title)");
  }

  try {
    const result = await documentClient.send(
      new UpdateCommand({
        TableName: itemsTableName,
        Key: { listId, itemId },
        ConditionExpression: ["attribute_exists(itemId)", ...guards].join(
          " AND ",
        ),
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues:
          Object.keys(values).length > 0 ? values : undefined,
        ReturnValues: "ALL_NEW",
      }),
    );

    await deleteImages([replacedImageKey]);

    return ctx.json(result.Attributes);
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      // Either the item is gone or the other of name and link was cleared meanwhile
      return guards.length > 0
        ? ctx.json({ error: "title or url is required" }, 400)
        : ctx.json({ error: "Not found" }, 404);
    }

    throw err;
  }
});

app.delete("/lists/:listId/items/:itemId", async (ctx) => {
  const listId = ctx.req.param("listId");
  const itemId = ctx.req.param("itemId");
  const userId = ctx.get("userId");

  const listResult = await documentClient.send(
    new GetCommand({
      TableName: listsTableName,
      Key: { listId },
    }),
  );

  if (!listResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }
  if (listResult.Item.ownerId !== userId) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const deleted = await documentClient.send(
    new DeleteCommand({
      TableName: itemsTableName,
      Key: { listId, itemId },
      ReturnValues: "ALL_OLD",
    }),
  );
  await deleteImages([deleted.Attributes?.imageKey]);

  return ctx.body(null, 204);
});

// Returns a form the browser posts a resized photo to; saving the item then attaches it
app.post("/lists/:listId/images", async (ctx) => {
  const listId = ctx.req.param("listId");
  const userId = ctx.get("userId");

  const listResult = await documentClient.send(
    new GetCommand({
      TableName: listsTableName,
      Key: { listId },
    }),
  );

  if (!listResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }
  if (listResult.Item.ownerId !== userId) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const body = await readBody(ctx.req);
  if (!body) {
    return ctx.json({ error: "Invalid JSON body" }, 400);
  }

  const upload = await createUpload(listId, body.contentType);
  if (!upload) {
    return ctx.json(
      { error: "contentType must be image/webp or image/jpeg" },
      400,
    );
  }

  return ctx.json(upload, 201);
});

app.post("/lists/:listId/share", async (ctx) => {
  const listId = ctx.req.param("listId");
  const userId = ctx.get("userId");

  const listResult = await documentClient.send(
    new GetCommand({
      TableName: listsTableName,
      Key: { listId },
    }),
  );

  if (!listResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }
  if (listResult.Item.ownerId !== userId) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const shareToken = crypto.randomUUID();

  await documentClient.send(
    new UpdateCommand({
      TableName: listsTableName,
      Key: { listId },
      ConditionExpression: "ownerId = :ownerId",
      UpdateExpression: "SET shareToken = :shareToken",
      ExpressionAttributeValues: {
        ":shareToken": shareToken,
        ":ownerId": userId,
      },
    }),
  );

  return ctx.json({ shareToken });
});

export const handler = handle(app);
