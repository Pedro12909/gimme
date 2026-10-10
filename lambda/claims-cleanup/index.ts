import type { DynamoDBBatchResponse, DynamoDBStreamEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

// Removes the claim for every item deleted from the Items table. The owner Lambda has no
// access to Claims by design, so it can't do this itself; this function can only delete claims.

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient());
const claimsTableName = process.env["CLAIMS_TABLE_NAME"];

export const handler = async (
  event: DynamoDBStreamEvent,
): Promise<DynamoDBBatchResponse> => {
  const batchItemFailures: DynamoDBBatchResponse["batchItemFailures"] = [];

  for (const record of event.Records) {
    // The event source filter only sends REMOVE events, but don't rely on that alone
    if (record.eventName !== "REMOVE" || !record.dynamodb?.Keys) {
      continue;
    }

    // aws-lambda and the AWS SDK each define their own AttributeValue type; the shapes match
    const { listId, itemId } = unmarshall(
      record.dynamodb.Keys as Parameters<typeof unmarshall>[0],
    );

    try {
      // Deleting a claim that doesn't exist is a no-op, so retries and unclaimed items are safe
      await documentClient.send(
        new DeleteCommand({
          TableName: claimsTableName,
          Key: { listId, itemId },
        }),
      );
    } catch (err) {
      console.error("Failed to delete claim", { listId, itemId, err });
      // Lambda retries from this record onwards; earlier records aren't processed again
      batchItemFailures.push({
        itemIdentifier: record.dynamodb.SequenceNumber ?? "",
      });
      break;
    }
  }

  return { batchItemFailures };
};
