-- Fix field name error in update_follow_counts() trigger function
-- Change following_id to followee_id to match the actual follows table schema
-- This fixes the error: "record \"new\" has no field \"following_id\""

CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 增加被关注者的粉丝数
    UPDATE profiles
    SET follower_count = follower_count + 1
    WHERE id = NEW.followee_id;  -- Fixed: was following_id
    
    -- 增加关注者的关注数
    UPDATE profiles
    SET following_count = following_count + 1
    WHERE id = NEW.follower_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- 减少被关注者的粉丝数
    UPDATE profiles
    SET follower_count = GREATEST(0, follower_count - 1)
    WHERE id = OLD.followee_id;  -- Fixed: was following_id
    
    -- 减少关注者的关注数
    UPDATE profiles
    SET following_count = GREATEST(0, following_count - 1)
    WHERE id = OLD.follower_id;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
