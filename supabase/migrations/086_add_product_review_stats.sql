-- Add product review stats to products
-- These columns are updated via a trigger on product_reviews for fast reads.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2);

-- Function to recalculate stats for a product
CREATE OR REPLACE FUNCTION public.recalc_product_review_stats(p_product_id UUID)
RETURNS VOID AS $$
DECLARE
  v_count INT;
  v_avg NUMERIC;
BEGIN
  SELECT
    COUNT(*)::INT,
    ROUND(AVG(rating)::numeric, 2)
  INTO v_count, v_avg
  FROM public.product_reviews
  WHERE product_id = p_product_id
    AND status = 'approved';

  UPDATE public.products
  SET review_count = COALESCE(v_count, 0),
      average_rating = v_avg
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to keep stats up to date
CREATE OR REPLACE FUNCTION public.trigger_recalc_product_review_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.recalc_product_review_stats(NEW.product_id);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.recalc_product_review_stats(NEW.product_id);
    IF (OLD.product_id IS DISTINCT FROM NEW.product_id) THEN
      PERFORM public.recalc_product_review_stats(OLD.product_id);
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.recalc_product_review_stats(OLD.product_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalc_product_review_stats ON public.product_reviews;
CREATE TRIGGER trigger_recalc_product_review_stats
AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalc_product_review_stats();

