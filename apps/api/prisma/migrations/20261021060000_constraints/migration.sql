-- Najwyżej jeden aktywny (nierozwiązany) alert na produkt — chroni przed duplikatami przy współbieżnych operacjach.
CREATE UNIQUE INDEX "StockAlert_one_active_per_product"
  ON "StockAlert" ("productId")
  WHERE "status" <> 'RESOLVED';

-- Stan nie może być ujemny.
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_quantity_non_negative" CHECK ("quantity" >= 0);
