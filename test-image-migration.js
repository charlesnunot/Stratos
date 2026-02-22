/**
 * Test script to verify image migration logic
 * Run this in the browser console or as a Node.js script
 */

// Mock data scenarios
const testScenarios = [
  {
    name: "纯 Cloudinary URL（已审核商品编辑后）",
    images: [
      "https://res.cloudinary.com/dpgkgtb5n/image/upload/v1234567890/products/abc123.jpg",
      "https://res.cloudinary.com/dpgkgtb5n/image/upload/v1234567890/products/def456.jpg"
    ],
    color_options: [
      { name: "红色", image_url: "https://res.cloudinary.com/dpgkgtb5n/image/upload/v1234567890/products/red.jpg" },
      { name: "蓝色", image_url: "https://res.cloudinary.com/dpgkgtb5n/image/upload/v1234567890/products/blue.jpg" }
    ],
    expected: {
      shouldPassCheck: true,
      shouldMigrate: false,
      migrated: 0
    }
  },
  {
    name: "混合 URL（编辑后添加新图片）",
    images: [
      "https://res.cloudinary.com/dpgkgtb5n/image/upload/v1234567890/products/old.jpg",
      "https://ihvjfkxkoxxnnnebrvlc.supabase.co/storage/v1/object/public/products/products/user123/1234567890-abc.jpg"
    ],
    color_options: [
      { name: "红色", image_url: "https://res.cloudinary.com/dpgkgtb5n/image/upload/v1234567890/products/red.jpg" },
      { name: "蓝色", image_url: "https://ihvjfkxkoxxnnnebrvlc.supabase.co/storage/v1/object/public/products/products/user123/1234567890-blue.jpg" }
    ],
    expected: {
      shouldPassCheck: true,
      shouldMigrate: true,
      migrated: 2  // 2个Supabase URL需要迁移
    }
  },
  {
    name: "纯 Supabase URL（新商品）",
    images: [
      "https://ihvjfkxkoxxnnnebrvlc.supabase.co/storage/v1/object/public/products/products/user123/1234567890-1.jpg",
      "https://ihvjfkxkoxxnnnebrvlc.supabase.co/storage/v1/object/public/products/products/user123/1234567890-2.jpg"
    ],
    color_options: [
      { name: "红色", image_url: "https://ihvjfkxkoxxnnnebrvlc.supabase.co/storage/v1/object/public/products/products/user123/1234567890-red.jpg" }
    ],
    expected: {
      shouldPassCheck: true,
      shouldMigrate: true,
      migrated: 3  // 3个Supabase URL需要迁移
    }
  },
  {
    name: "包含外链 URL（异常情况）",
    images: [
      "https://example.com/external-image.jpg",
      "https://res.cloudinary.com/dpgkgtb5n/image/upload/v1234567890/products/valid.jpg"
    ],
    color_options: [],
    expected: {
      shouldPassCheck: false,  // 应该拒绝，因为包含未导入的外链
      shouldMigrate: false,
      migrated: 0
    }
  }
];

// Helper functions (copied from the actual code)
const SUPABASE_PUBLIC_PATTERN = /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

function parseSupabasePublicUrl(url: string): { bucket: string; path: string } | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.trim().match(SUPABASE_PUBLIC_PATTERN);
  if (!m) return null;
  const bucket = decodeURIComponent(m[1]);
  const path = decodeURIComponent(m[2]).split('?')[0].trim();
  return path ? { bucket, path } : null;
}

function isSupabaseStorageUrl(url: string): boolean {
  return !!url && url.includes('supabase.co') && !!parseSupabasePublicUrl(url);
}

// Test the check logic
function testCheckLogic(scenario: typeof testScenarios[0]) {
  const images = scenario.images;
  
  // Check 1: Has images
  if (images.length === 0) {
    return { pass: false, reason: 'No images' };
  }
  
  // Check 2: Has Cloudinary or Supabase images
  const hasCloudinaryImage = images.some(url => url && url.includes('cloudinary.com'));
  const hasSupabaseImage = images.some(isSupabaseStorageUrl);
  
  // Check 3: Not external URL
  if (images.length > 0 && !hasSupabaseImage && !hasCloudinaryImage) {
    return { pass: false, reason: 'External URLs not allowed' };
  }
  
  return { pass: true, hasCloudinary: hasCloudinaryImage, hasSupabase: hasSupabaseImage };
}

// Test the migration logic
function testMigrationLogic(scenario: typeof testScenarios[0]) {
  const images = scenario.images;
  const colorOptions = scenario.color_options;
  
  const supabaseImageUrls = images.filter(isSupabaseStorageUrl);
  const colorOptionImageUrls = colorOptions
    .map(opt => opt.image_url)
    .filter((url): url is string => !!url && isSupabaseStorageUrl(url));
  
  const allSupabaseUrls = [...supabaseImageUrls, ...colorOptionImageUrls];
  
  return {
    shouldMigrate: allSupabaseUrls.length > 0,
    supabaseCount: allSupabaseUrls.length,
    cloudinaryCount: images.length + colorOptions.filter(o => o.image_url).length - allSupabaseUrls.length
  };
}

// Run tests
console.log('Running image migration logic tests...\n');

testScenarios.forEach((scenario, index) => {
  console.log(`Test ${index + 1}: ${scenario.name}`);
  console.log('Images:', scenario.images.length);
  console.log('Color options:', scenario.color_options.length);
  
  const checkResult = testCheckLogic(scenario);
  const migrationResult = testMigrationLogic(scenario);
  
  console.log('Check logic:', checkResult.pass ? '✅ PASS' : '❌ FAIL', 
    checkResult.pass ? `(Cloudinary: ${checkResult.hasCloudinary}, Supabase: ${checkResult.hasSupabase})` : `(${checkResult.reason})`);
  console.log('Migration logic:', migrationResult.shouldMigrate ? '✅ Will migrate' : '⏭️  Will skip', 
    `(Supabase: ${migrationResult.supabaseCount}, Cloudinary: ${migrationResult.cloudinaryCount})`);
  
  const checkMatch = checkResult.pass === scenario.expected.shouldPassCheck;
  const migrateMatch = migrationResult.shouldMigrate === scenario.expected.shouldMigrate;
  const countMatch = migrationResult.supabaseCount === scenario.expected.migrated;
  
  console.log('Expected check:', scenario.expected.shouldPassCheck ? 'PASS' : 'FAIL');
  console.log('Expected migrate:', scenario.expected.shouldMigrate ? 'Yes' : 'No');
  console.log('Expected count:', scenario.expected.migrated);
  
  if (checkMatch && migrateMatch && countMatch) {
    console.log('✅ All checks passed!\n');
  } else {
    console.log('❌ Test failed!');
    if (!checkMatch) console.log('  - Check logic mismatch');
    if (!migrateMatch) console.log('  - Migration logic mismatch');
    if (!countMatch) console.log('  - Count mismatch');
    console.log('');
  }
});

console.log('All tests completed!');
