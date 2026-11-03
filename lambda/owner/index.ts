import { Hono } from "hono";
import {
  ApiGatewayRequestContextV2,
  handle,
  LambdaContext,
} from "hono/aws-lambda";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import * as crypto from "node:crypto";
import {
  backfillPositions,
  compareItems,
  positionAfter,
} from "../shared/item-order";
import { MAX_ITEMS_PER_LIST, MAX_LISTS_PER_OWNER } from "../shared/limits";
import { createUpload, deleteImages, publishUpload } from "./images";
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
  const result = await documentClient.send(
    new GetCommand({
      TableName: ownersTableName,
      Key: { ownerId: ctx.get("userId") },
    }),
  );

  return ctx.json({ displayName: result.Item?.displayName });
});

// An empty displayName removes it
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
  const ownerId = ctx.get("userId");

  if (displayName === "") {
    await documentClient.send(
      new DeleteCommand({ TableName: ownersTableName, Key: { ownerId } }),
    );
  } else {
    await documentClient.send(
      new PutCommand({
        TableName: ownersTableName,
        Item: { ownerId, displayName },
      }),
    );
  }

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

  const listId = crypto.randomUUID();
  const shareToken = crypto.randomUUID();

  const list = {
    listId,
    ownerId,
    title,
    description,
    eventDate: eventDate || undefined,
    isPrivate: isPrivate === true || undefined,
    shareToken,
    createdAt: new Date().toISOString(),
  };

  await documentClient.send(
    new PutCommand({
      TableName: listsTableName,
      Item: list,
    }),
  );

  return ctx.json(list, 201);
});

app.get("/lists", async (ctx) => {
  const userid = ctx.get("userId");

  const result = await documentClient.send(
    new QueryCommand({
      TableName: listsTableName,
      IndexName: "OwnerIndex",
      KeyConditionExpression: "ownerId = :ownerId",
      ExpressionAttributeValues: { ":ownerId": userid },
    }),
  );

  // Each list comes with its item count and first few photos, so the lists screen can tell
  // lists apart at a glance. One small query per list: owners have a handful of lists, and
  // only the fields needed for ordering and photos are read.
  const lists = await Promise.all(
    (result.Items ?? []).map(async (list) => {
      const itemsResult = await documentClient.send(
        new QueryCommand({
          TableName: itemsTableName,
          KeyConditionExpression: "listId = :listId",
          ProjectionExpression: "itemId, #position, createdAt, imageUrl",
          ExpressionAttributeNames: { "#position": "position" },
          ExpressionAttributeValues: { ":listId": list.listId },
        }),
      );
      const items = (itemsResult.Items ?? []).sort(compareItems);

      return {
        ...list,
        itemCount: items.length,
        previewImages: items
          .map((item) => item.imageUrl)
          .filter((url): url is string => typeof url === "string")
          .slice(0, LIST_PREVIEW_IMAGES),
      };
    }),
  );

  return ctx.json(lists);
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

  return ctx.json({ ...listResult.Item, items });
});

app.patch("/lists/:listId", async (ctx) => {
  const listId = ctx.req.param("listId");
  const userId = ctx.get("userId");
  const body = await readBody(ctx.req);
  if (!body) {
    return ctx.json({ error: "Invalid JSON body" }, 400);
  }

  const { title, description, eventDate, isPrivate } = body;
  const error =
    checkText(title, "title", LIMITS.listTitle, title !== undefined) ??
    checkText(description, "description", LIMITS.description) ??
    checkEventDate(eventDate, true) ??
    checkPrivate(isPrivate);
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

  if (updates.length === 0 && removes.length === 0) {
    return ctx.json({ error: "Nothing to update" }, 400);
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

  return ctx.json(result.Attributes);
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

  const itemsResult = await documentClient.send(
    new QueryCommand({
      TableName: itemsTableName,
      KeyConditionExpression: "listId = :listId",
      ExpressionAttributeValues: { ":listId": listId },
    }),
  );

  for (const item of itemsResult.Items ?? []) {
    await documentClient.send(
      new DeleteCommand({
        TableName: itemsTableName,
        Key: { listId, itemId: item.itemId },
      }),
    );
  }
  await deleteImages((itemsResult.Items ?? []).map((item) => item.imageKey));

  await documentClient.send(
    new DeleteCommand({
      TableName: listsTableName,
      Key: { listId },
      ConditionExpression: "ownerId = :ownerId",
      ExpressionAttributeValues: { ":ownerId": userId },
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

  try {
    const result = await documentClient.send(
      new UpdateCommand({
        TableName: itemsTableName,
        Key: { listId, itemId },
        ConditionExpression: "attribute_exists(itemId)",
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
      return ctx.json({ error: "Not found" }, 404);
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
