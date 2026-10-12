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

const LIMITS = {
  listTitle: 100,
  description: 500,
  itemTitle: 200,
  note: 500,
  url: 2048,
  price: 32,
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

// Guests open these links, so anything other than a web link (e.g. javascript:) is rejected
const checkUrl = (value: unknown, required = false) => {
  const textError = checkText(value, "url", LIMITS.url, required);
  if (textError || value === undefined) {
    return textError;
  }

  try {
    const { protocol } = new URL(value as string);
    if (protocol === "http:" || protocol === "https:") {
      return undefined;
    }
  } catch {
    // Not a parseable URL
  }
  return "url must be an http or https link";
};

// Shown to guests on an https page, so only https images are accepted. Empty means "no image".
const checkImageUrl = (value: unknown) => {
  if (value === undefined || value === "") {
    return undefined;
  }
  const textError = checkText(value, "imageUrl", LIMITS.url);
  if (textError) {
    return textError;
  }

  try {
    if (new URL(value as string).protocol === "https:") {
      return undefined;
    }
  } catch {
    // Not a parseable URL
  }
  return "imageUrl must be an https link";
};

// Middleware
app.use("*", async (ctx, next) => {
  const sub = ctx.env.requestContext.authorizer.jwt?.claims.sub;

  if (!sub) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  ctx.set("userId", sub as string);

  return next();
});

app.post("/lists", async (ctx) => {
  const body = await readBody(ctx.req);
  if (!body) {
    return ctx.json({ error: "Invalid JSON body" }, 400);
  }

  const { title, description } = body;
  const error =
    checkText(title, "title", LIMITS.listTitle, true) ??
    checkText(description, "description", LIMITS.description);
  if (error) {
    return ctx.json({ error }, 400);
  }

  const listId = crypto.randomUUID();
  const shareToken = crypto.randomUUID();

  const ownerId = ctx.get("userId");

  const list = {
    listId,
    ownerId,
    title,
    description,
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
  return ctx.json(result.Items ?? []);
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

  // The sort key is a random UUID, so restore the order items were added in
  const items = (itemsResult.Items ?? []).sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt)),
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

  const { title, description } = body;
  const error =
    checkText(title, "title", LIMITS.listTitle, title !== undefined) ??
    checkText(description, "description", LIMITS.description);
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
  const values: Record<string, unknown> = { ":ownerId": userId };

  if (title !== undefined) {
    updates.push("title = :title");
    values[":title"] = title;
  }
  if (description !== undefined) {
    updates.push("description = :description");
    values[":description"] = description;
  }

  if (updates.length === 0) {
    return ctx.json({ error: "Nothing to update" }, 400);
  }

  const result = await documentClient.send(
    new UpdateCommand({
      TableName: listsTableName,
      Key: { listId },
      ConditionExpression: "ownerId = :ownerId",
      UpdateExpression: `SET ${updates.join(", ")}`,
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

  const { url, title, note, imageUrl, price } = body;
  const error =
    checkUrl(url, true) ??
    checkText(title, "title", LIMITS.itemTitle) ??
    checkText(note, "note", LIMITS.note) ??
    checkImageUrl(imageUrl) ??
    checkText(price, "price", LIMITS.price);
  if (error) {
    return ctx.json({ error }, 400);
  }

  const itemId = crypto.randomUUID();

  const item = {
    listId,
    itemId,
    url,
    // Empty optional fields are left out rather than stored as ""
    title: title || undefined,
    note: note || undefined,
    imageUrl: imageUrl || undefined,
    price: price || undefined,
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

  const { url, title, note, imageUrl, price } = body;
  const error =
    checkUrl(url, url !== undefined) ??
    checkText(title, "title", LIMITS.itemTitle) ??
    checkText(note, "note", LIMITS.note) ??
    checkImageUrl(imageUrl) ??
    checkText(price, "price", LIMITS.price);
  if (error) {
    return ctx.json({ error }, 400);
  }

  const sets: string[] = [];
  const removes: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [field, value] of Object.entries({
    url,
    title,
    note,
    imageUrl,
    price,
  })) {
    if (value === undefined) {
      continue;
    }
    // Attribute names go through placeholders, since words like "url" can clash with DynamoDB reserved words
    names[`#${field}`] = field;

    // Clearing an optional field removes it rather than storing "" (url is required, so never empty here)
    if (value === "") {
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

  await documentClient.send(
    new DeleteCommand({
      TableName: itemsTableName,
      Key: { listId, itemId },
    }),
  );

  return ctx.body(null, 204);
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
