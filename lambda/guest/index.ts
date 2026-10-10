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
} from "@aws-sdk/lib-dynamodb";
import * as crypto from "node:crypto";

type Bindings = {
  requestContext: ApiGatewayRequestContextV2;
  lambdaContext: LambdaContext;
};

const app = new Hono<{ Bindings: Bindings }>();
const dbClient = new DynamoDBClient();
const documentClient = DynamoDBDocumentClient.from(dbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const listsTableName = process.env["LISTS_TABLE_NAME"];
const itemsTableName = process.env["ITEMS_TABLE_NAME"];
const claimsTableName = process.env["CLAIMS_TABLE_NAME"];

const MAX_CLAIMER_NAME_LENGTH = 50;

// The guest never sends a listId: it is always derived from the share token.
const findListByShareToken = async (shareToken: string) => {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: listsTableName,
      IndexName: "ShareTokenIndex",
      KeyConditionExpression: "shareToken = :shareToken",
      ExpressionAttributeValues: { ":shareToken": shareToken },
    }),
  );

  return result.Items?.[0];
};

// Only a hash of the claim secret is stored, so a leaked Claims row can't be used to unclaim.
const hashSecret = (secret: string) =>
  crypto.createHash("sha256").update(secret).digest("hex");

app.get("/share/:token", async (ctx) => {
  const list = await findListByShareToken(ctx.req.param("token"));

  if (!list) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const [itemsResult, claimsResult] = await Promise.all([
    documentClient.send(
      new QueryCommand({
        TableName: itemsTableName,
        KeyConditionExpression: "listId = :listId",
        ExpressionAttributeValues: { ":listId": list.listId },
      }),
    ),
    documentClient.send(
      new QueryCommand({
        TableName: claimsTableName,
        KeyConditionExpression: "listId = :listId",
        ExpressionAttributeValues: { ":listId": list.listId },
      }),
    ),
  ]);

  const claimsMap = new Map<string, Record<string, any>>();
  claimsResult.Items?.forEach((claim) => {
    claimsMap.set(claim.itemId, claim);
  });

  // The sort key is a random UUID, so restore the order the owner added items in
  const sortedItems = (itemsResult.Items ?? []).sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt)),
  );

  const items = sortedItems.map((item) => {
    const claim = claimsMap.get(item.itemId);

    return {
      itemId: item.itemId,
      url: item.url,
      title: item.title,
      note: item.note,
      claimed: claim !== undefined,
      claimerName: claim?.claimerName,
    };
  });

  return ctx.json({
    title: list.title,
    description: list.description,
    items,
  });
});

app.post("/share/:token/items/:itemId/claim", async (ctx) => {
  const itemId = ctx.req.param("itemId");
  const list = await findListByShareToken(ctx.req.param("token"));

  if (!list) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const itemResult = await documentClient.send(
    new GetCommand({
      TableName: itemsTableName,
      Key: { listId: list.listId, itemId },
    }),
  );

  if (!itemResult.Item) {
    return ctx.json({ error: "Not found" }, 404);
  }

  // The body is optional, a guest can claim without giving a name
  const body = await ctx.req.json().catch(() => ({}));
  const claimerName =
    typeof body?.claimerName === "string" ? body.claimerName.trim() : "";

  if (claimerName.length > MAX_CLAIMER_NAME_LENGTH) {
    return ctx.json(
      {
        error: `claimerName must be at most ${MAX_CLAIMER_NAME_LENGTH} characters`,
      },
      400,
    );
  }

  const claimSecret = crypto.randomBytes(32).toString("base64url");

  try {
    await documentClient.send(
      new PutCommand({
        TableName: claimsTableName,
        Item: {
          listId: list.listId,
          itemId,
          claimerName: claimerName || undefined,
          claimSecretHash: hashSecret(claimSecret),
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(itemId)",
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return ctx.json({ error: "Item already claimed" }, 409);
    }

    throw err;
  }

  return ctx.json({ itemId, claimSecret }, 201);
});

app.delete("/share/:token/items/:itemId/claim", async (ctx) => {
  const itemId = ctx.req.param("itemId");
  const list = await findListByShareToken(ctx.req.param("token"));

  if (!list) {
    return ctx.json({ error: "Not found" }, 404);
  }

  const body = await ctx.req.json().catch(() => ({}));
  const claimSecret = body?.claimSecret;

  if (typeof claimSecret !== "string" || claimSecret.length === 0) {
    return ctx.json({ error: "claimSecret is required" }, 400);
  }

  try {
    await documentClient.send(
      new DeleteCommand({
        TableName: claimsTableName,
        Key: { listId: list.listId, itemId },
        ConditionExpression: "claimSecretHash = :claimSecretHash",
        ExpressionAttributeValues: {
          ":claimSecretHash": hashSecret(claimSecret),
        },
      }),
    );
  } catch (err) {
    // Covers both "no claim exists" and "wrong secret", without revealing which
    if (err instanceof ConditionalCheckFailedException) {
      return ctx.json({ error: "Forbidden" }, 403);
    }

    throw err;
  }

  return ctx.body(null, 204);
});

export const handler = handle(app);
