-- Create seller reputation system
-- Tracks seller ratings, fulfillment rate, and dispute rate

-- Create seller_ratings table
CREATE TABLE IF NOT EXISTS seller_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  buyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  fulfillment_rating INT CHECK (fulfillment_rating >= 1 AND fulfillment_rating <= 5), -- Did seller ship on time?
  quality_rating INT CHECK (quality_rating >= 1 AND quality_rating <= 5), -- Product quality
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, buyer_id)
);

-- Add reputation fields to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seller_rating DECIMAL(3,2), -- Average rating (1-5)
  ADD COLUMN IF NOT EXISTS seller_review_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_fulfillment_rate DECIMAL(5,2), -- Percentage of orders shipped on time
  ADD COLUMN IF NOT EXISTS seller_dispute_rate DECIMAL(5,2); -- Percentage of orders with disputes

-- Function to recalculate seller reputation
CREATE OR REPLACE FUNCTION recalculate_seller_reputation(p_seller_id UUID)
RETURNS VOID AS $$
DECLARE
  v_avg_rating DECIMAL(3,2);
  v_review_count INT;
  v_fulfillment_rate DECIMAL(5,2);
  v_dispute_rate DECIMAL(5,2);
  v_total_orders INT;
  v_fulfilled_orders INT;
  v_disputed_orders INT;
BEGIN
  -- Calculate average rating
  SELECT 
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    COUNT(*)
  INTO v_avg_rating, v_review_count
  FROM seller_ratings
  WHERE seller_id = p_seller_id;

  -- Calculate fulfillment rate (orders shipped on time)
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE order_status = 'shipped' AND ship_by_date IS NOT NULL AND ship_by_date >= updated_at)
  INTO v_total_orders, v_fulfilled_orders
  FROM orders
  WHERE seller_id = p_seller_id
    AND payment_status = 'paid'
    AND order_status IN ('shipped', 'completed');

  IF v_total_orders > 0 THEN
    v_fulfillment_rate := ROUND((v_fulfilled_orders::numeric / v_total_orders::numeric * 100), 2);
  ELSE
    v_fulfillment_rate := 100.00;
  END IF;

  -- Calculate dispute rate
  SELECT COUNT(DISTINCT order_id)
  INTO v_disputed_orders
  FROM order_disputes
  WHERE order_id IN (
    SELECT id FROM orders WHERE seller_id = p_seller_id AND payment_status = 'paid'
  )
  AND status IN ('pending', 'reviewing', 'resolved');

  IF v_total_orders > 0 THEN
    v_dispute_rate := ROUND((v_disputed_orders::numeric / v_total_orders::numeric * 100), 2);
  ELSE
    v_dispute_rate := 0.00;
  END IF;

  -- Update profiles table
  UPDATE profiles
  SET 
    seller_rating = v_avg_rating,
    seller_review_count = v_review_count,
    seller_fulfillment_rate = v_fulfillment_rate,
    seller_dispute_rate = v_dispute_rate
  WHERE id = p_seller_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to recalculate reputation when rating is added/updated
CREATE OR REPLACE FUNCTION trigger_recalculate_seller_reputation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_seller_reputation(NEW.seller_id);
  IF OLD.seller_id IS DISTINCT FROM NEW.seller_id THEN
    PERFORM recalculate_seller_reputation(OLD.seller_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_seller_reputation ON seller_ratings;
CREATE TRIGGER trigger_recalculate_seller_reputation
  AFTER INSERT OR UPDATE OR DELETE ON seller_ratings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_seller_reputation();

-- Trigger to recalculate when order status changes
CREATE OR REPLACE FUNCTION trigger_recalculate_seller_reputation_on_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_status IN ('shipped', 'completed') AND OLD.order_status NOT IN ('shipped', 'completed') THEN
    PERFORM recalculate_seller_reputation(NEW.seller_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_seller_reputation_on_order ON orders;
CREATE TRIGGER trigger_recalculate_seller_reputation_on_order
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_seller_reputation_on_order();

-- Indexes
CREATE INDEX idx_seller_ratings_seller_id ON seller_ratings(seller_id);
CREATE INDEX idx_seller_ratings_order_id ON seller_ratings(order_id);
CREATE INDEX idx_seller_ratings_buyer_id ON seller_ratings(buyer_id);
