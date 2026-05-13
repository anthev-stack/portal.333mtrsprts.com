-- Optional order / tracking reference for follow-ups (e.g. customer calling about shipment).
ALTER TABLE "CustomerCareRequest" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "CustomerCareRequest" ADD COLUMN "trackingNumber" TEXT;
