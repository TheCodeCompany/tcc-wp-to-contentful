const contentful = require('contentful-management')
const axios = require('axios')
const fs = require('fs');
const TurndownService = require('turndown')

// Load configuration from external file
let config;
try {
  config = require('./config');
} catch (error) {
  console.error('❌ Configuration file not found!');
  console.error('Please copy config.template.js to config.js and fill in your credentials.');
  console.error('Run: cp config.template.js config.js');
  process.exit(1);
}

console.log('🚀 WordPress to Contentful Migration Script Starting...')
console.log('📋 Configuration loaded successfully')

// Validate required configuration
if (!config.contentful.accessToken || !config.contentful.spaceId || !config.wordpress.endpoint) {
  console.error('❌ Missing required configuration values!');
  console.error('Please check your config.js file and ensure all required fields are filled in.');
  process.exit(1);
}

// Validate access token format
if (!config.contentful.accessToken.startsWith('CFPAT-')) {
  console.error('❌ Invalid Contentful access token format!');
  console.error('Make sure you are using a Content Management API token (starts with CFPAT-)');
  console.error('Not a Content Delivery API token (starts with something else)');
  process.exit(1);
}

// Validate import post count
if (config.wordpress.importPostCount > 100) {
  console.log('⚠️  Large import detected!')
  console.log(`   You've set importPostCount to ${config.wordpress.importPostCount}`)
  console.log('   This might take a while and could hit API rate limits.')
  console.log('   Consider starting with a smaller number (e.g., 10-50) for testing.')
}

/**
 * Global variables that we're going use throughout this script
 * -----------------------------------------------------------------------------
 */

/**
 * Main WordPress endpoint.
 */
const wpEndpoint = config.wordpress.endpoint

/**
 * Limit the number of posts to import
 */
const import_post_count = config.wordpress.importPostCount

/**
 * Contentful content type ID to create entries as
 * Common content type names: 'blogPost', 'post', 'article', 'blog', 'page'
 * You need to create this content type in Contentful first or use an existing one
 */
const contentful_content_type = config.contentful.contentType

/**
 * API Endpoints that we'd like to receive data from
 * (e.g. /wp-json/wp/v2/${key})
 */
let wpData = {
  'posts': [],
  'tags': [],
  'categories': [],
  'media': []
};

/**
 * Contentful API requirements
 */
const ctfData = {
  accessToken: config.contentful.accessToken,
  environment: config.contentful.environment,
  spaceId: config.contentful.spaceId
}
Object.freeze(ctfData);

/**
 * Creation of Contentful Client
 */
const ctfClient = contentful.createClient({
  accessToken: ctfData.accessToken
})

/**
 * Internal: log output separator for terminal.
 */
const logSeparator = `-------`

/**
 * Object to store WordPress API data in
 */
let apiData = {}

/**
 * Object to store Contentful Data in.
 */
let contentfulData = []

/**
 * Markdown / Content conversion functions.
 */
const turndownService = new TurndownService({
  codeBlockStyle: 'fenced'
})

/**
 * Convert HTML codeblocks to Markdown codeblocks.
 */
turndownService.addRule('fencedCodeBlock', {
  filter: function (node, options) {
    return (
      options.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    )
  },
  replacement: function (content, node, options) {
    let className = node.firstChild.getAttribute('class') || ''
    let language = (className.match(/language-(\S+)/) || [null, ''])[1]

    return (
      '\n\n' + options.fence + language + '\n' +
      node.firstChild.textContent +
      '\n' + options.fence + '\n\n'
    )
  }
})

/**
 * Convert inline HTML images to inline markdown image format.
 */
turndownService.addRule('replaceWordPressImages', {
  filter: ['img'],
  replacement: function(content, node, options) {
    let assetUrl = contentfulData.assets.filter(asset => {
      let assertFileName = asset.split('/').pop()
      let nodeFileName = node.getAttribute('src').split('/').pop()

      if (assertFileName === nodeFileName) {
        return asset
      }
    })[0];

    return `![${node.getAttribute('alt')}](${assetUrl})`
  }
})

/**
 * Convert HTML content to Contentful RichText format
 * @param {String} htmlContent - WordPress post content in HTML
 */
function convertToRichText(htmlContent) {
  // Simple conversion - creates a basic RichText document with paragraphs
  // This handles basic HTML to RichText conversion
  
  // Remove undefined image references and clean up content
  let cleanContent = htmlContent.replace(/!\[.*?\]\(undefined\)/g, '')
  
  // Convert to markdown first to get clean text
  const markdown = turndownService.turndown(cleanContent)
  
  // Split into paragraphs and process each one
  const lines = markdown.split('\n').filter(line => line.trim().length > 0)
  const content = []
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    
    if (trimmedLine.startsWith('# ')) {
      // Heading 1
      content.push({
        nodeType: 'heading-1',
        data: {},
        content: [{
          nodeType: 'text',
          value: trimmedLine.substring(2),
          marks: [],
          data: {}
        }]
      })
    } else if (trimmedLine.startsWith('## ')) {
      // Heading 2
      content.push({
        nodeType: 'heading-2',
        data: {},
        content: [{
          nodeType: 'text',
          value: trimmedLine.substring(3),
          marks: [],
          data: {}
        }]
      })
    } else if (trimmedLine.startsWith('### ')) {
      // Heading 3
      content.push({
        nodeType: 'heading-3',
        data: {},
        content: [{
          nodeType: 'text',
          value: trimmedLine.substring(4),
          marks: [],
          data: {}
        }]
      })
    } else if (trimmedLine.startsWith('> ')) {
      // Blockquote
      content.push({
        nodeType: 'blockquote',
        data: {},
        content: [{
          nodeType: 'paragraph',
          data: {},
          content: [{
            nodeType: 'text',
            value: trimmedLine.substring(2),
            marks: [],
            data: {}
          }]
        }]
      })
    } else if (trimmedLine.length > 0) {
      // Regular paragraph
      content.push({
        nodeType: 'paragraph',
        data: {},
        content: [{
          nodeType: 'text',
          value: trimmedLine,
          marks: [],
          data: {}
        }]
      })
    }
  }
  
  return {
    nodeType: 'document',
    data: {},
    content: content
  }
}

/**
 * Main Migration Script.
 * -----------------------------------------------------------------------------
 */

/**
 * Test Contentful connection before starting migration
 */
async function testContentfulConnection() {
  console.log('🔗 Testing Contentful connection...')
  
  try {
    const space = await ctfClient.getSpace(ctfData.spaceId)
    console.log(`✅ Connected to space: "${space.name}"`)
    
    const environment = await space.getEnvironment(ctfData.environment)
    console.log(`✅ Connected to environment: "${environment.sys.id}"`)
    
    return environment
  } catch (error) {
    console.error('❌ Connection test failed:')
    console.error('Status:', error.response?.status)
    console.error('Message:', error.message)
    
    if (error.response?.status === 401) {
      console.error('\n🔑 Authentication failed:')
      console.error('- Check your access token in config.js')
      console.error('- Make sure it\'s a Content Management API token (CFPAT-...)')
      console.error('- Verify the token hasn\'t expired')
    } else if (error.response?.status === 404) {
      console.error('\n🔍 Resource not found:')
      console.error('- Check your Space ID in config.js')
      console.error('- Verify the environment name (usually "master")')
    }
    
    process.exit(1)
  }
}

/**
 * Fetch data with pagination support for large datasets
 * WordPress typically limits per_page to 100, so we need to paginate for larger requests
 */
async function fetchDataWithPagination(baseUrl, totalItemsNeeded) {
  const maxPerPage = 100; // WordPress default limit
  let allData = [];
  let page = 1;
  let hasMorePages = true;
  
  console.log(`📡 Fetching up to ${totalItemsNeeded} items from: ${baseUrl}`)
  
  while (hasMorePages && allData.length < totalItemsNeeded) {
    const itemsToFetch = Math.min(maxPerPage, totalItemsNeeded - allData.length);
    const url = `${baseUrl}?per_page=${itemsToFetch}&page=${page}`;
    
    try {
      console.log(`   📄 Page ${page}: requesting ${itemsToFetch} items...`);
      const response = await axios.get(url);
      
      if (response.data.length === 0) {
        hasMorePages = false;
      } else {
        allData = allData.concat(response.data);
        console.log(`   ✅ Page ${page}: got ${response.data.length} items (total: ${allData.length})`);
        page++;
        
        // Check if we've reached the total available (from headers)
        const totalAvailable = response.headers['x-wp-total'] ? parseInt(response.headers['x-wp-total']) : null;
        if (totalAvailable && allData.length >= totalAvailable) {
          hasMorePages = false;
        }
      }
    } catch (error) {
      console.error(`   ❌ Page ${page} failed: ${error.response?.status} - ${error.message}`);
      hasMorePages = false;
    }
  }
  
  console.log(`   📊 Total fetched: ${allData.length} items`);
  return {
    success: allData.length > 0,
    data: allData,
    error: allData.length === 0 ? 'No data retrieved' : null
  };
}

/**
 * Check how many posts are available in WordPress before starting migration
 */
async function checkWordPressPostCount() {
  console.log('🔍 Checking WordPress post availability...')
  
  try {
    // Use a small request to get headers with total counts
    const response = await axios.get(`${wpEndpoint}posts?per_page=1`)
    const totalPosts = response.headers['x-wp-total'] ? parseInt(response.headers['x-wp-total']) : 'unknown'
    const totalPages = response.headers['x-wp-totalpages'] ? parseInt(response.headers['x-wp-totalpages']) : 'unknown'
    
    console.log(`📊 WordPress site stats:`)
    console.log(`   Total published posts: ${totalPosts}`)
    console.log(`   Total pages available: ${totalPages}`)
    console.log(`   Requested to import: ${import_post_count}`)
    
    if (totalPosts !== 'unknown' && totalPosts < import_post_count) {
      console.log(`⚠️  Note: You requested ${import_post_count} posts, but only ${totalPosts} are available.`)
      console.log(`   The migration will process all ${totalPosts} available posts.`)
    }
    
    if (import_post_count > 100) {
      console.log(`📝 Large dataset detected - will use pagination to fetch ${import_post_count} posts`)
    }
    
  } catch (error) {
    console.log(`⚠️  Could not check post count (${error.message}), proceeding with migration...`)
  }
}

function migrateContent() {
  let promises = [];

  console.log(logSeparator)
  console.log(`🚀 Starting WordPress to Contentful Migration`)
  console.log(logSeparator)

  // First test the Contentful connection
  testContentfulConnection().then(async () => {
    // Check WordPress post availability
    await checkWordPressPostCount()
    
    console.log(logSeparator)
    console.log(`📡 Getting WordPress API data`)
    console.log(logSeparator)

    // Use pagination for posts if needed, but keep smaller requests for other endpoints
    const endpoints = Object.keys(wpData);
    const fetchPromises = [];
    
    for (const endpoint of endpoints) {
      if (endpoint === 'posts') {
        // Use pagination for posts
        fetchPromises.push(
          fetchDataWithPagination(`${wpEndpoint}${endpoint}`, import_post_count)
            .then(result => ({ ...result, endpoint }))
        );
      } else {
        // Use standard fetch for other endpoints (tags, categories, media)
        const maxItems = endpoint === 'media' ? 100 : 50; // Limit media to avoid large requests
        fetchPromises.push(
          fetchDataWithPagination(`${wpEndpoint}${endpoint}`, maxItems)
            .then(result => ({ ...result, endpoint }))
        );
      }
    }

    Promise.all(fetchPromises)
      .then(results => {
        apiData = results;
        mapData();
      })
      .catch(error => {
        console.error('❌ Error fetching WordPress data:', error.message)
        process.exit(1)
      })
  })
}

/**
 * Get our entire API response and filter it down to only show content that we want to include
 */
function mapData() {
  console.log('📊 Processing API response data...')
  
  // Check for any failed API calls
  const failedCalls = apiData.filter(item => !item.success)
  if (failedCalls.length > 0) {
    console.log('⚠️  Some API calls failed:')
    failedCalls.forEach(failed => {
      console.log(`   - ${failed.endpoint}: ${failed.error}`)
    })
  }

  console.log(`📋 Successfully fetched data for: ${apiData.filter(item => item.success).map(item => item.endpoint).join(', ')}`)

  console.log(`Reducing API data to only include fields we want`)
  
  // Get posts data and validate it exists
  let apiPostsArray = apiData.filter(item => item.endpoint === 'posts' && item.success);
  if (!apiPostsArray || apiPostsArray.length === 0) {
    console.error('❌ No posts data found in API response')
    console.error('This could happen if:')
    console.error('1. WordPress site has no published posts')
    console.error('2. WordPress API is not accessible')
    console.error('3. WordPress endpoint URL is incorrect')
    process.exit(1)
  }
  
  let apiPosts = apiPostsArray[0];
  if (!apiPosts || !apiPosts.data || !Array.isArray(apiPosts.data)) {
    console.error('❌ Posts data is malformed or empty')
    console.error('API Posts Response:', apiPosts)
    process.exit(1)
  }

  if (apiPosts.data.length === 0) {
    console.log('⚠️  No posts found to migrate')
    console.log('This could happen if:')
    console.log('1. All posts are drafts or private')
    console.log('2. The importPostCount is set too high')
    console.log('3. WordPress has no published posts')
    process.exit(0)
  }

  console.log(`📝 Found ${apiPosts.data.length} posts to process`)
  
  // Loop over posts
  for (let [key, postData] of Object.entries(apiPosts.data)) {
    console.log(`   Parsing: ${postData.slug}`)
    /**
     * Create base object with only limited keys
     * (e.g. just 'slug', 'categories', 'title') etc.
     *
     * The idea here is that the key will be your Contentful field name
     * and the value be the WP post value. We will later match the keys
     * used here to their Contentful fields in the API.
     */
    let fieldData = {
      id: postData.id,
      type: postData.type,
      postTitle: postData.title.rendered,
      slug: postData.slug,
      content: postData.content.rendered,
      publishDate: postData.date_gmt + '+00:00',
      featuredImage: postData.featured_media,
      tags: getPostLabels(postData.tags, 'tags'),
      categories: getPostLabels(postData.categories, 'categories'),
      contentImages: getPostBodyImages(postData)
    }

    wpData.posts.push(fieldData)
  }

  console.log(`✅ Processed ${wpData.posts.length} posts successfully`)
  console.log(logSeparator)

  writeDataToFile(wpData, 'wpPosts');
  createForContentful();
}

function getPostBodyImages(postData) {
  // console.log(`- Getting content images`)
  let imageRegex = /<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g
  let bodyImages = []

  if (postData.featured_media > 0) {
    let mediaData = getApiDataType(`media`)[0];

    let mediaObj = mediaData.data.filter(obj => {
      if (obj.id === postData.featured_media) {
        return obj
      }
    })[0];

    // Add null check for mediaObj
    if (mediaObj) {
      bodyImages.push({
        link: mediaObj.source_url,
        description: mediaObj.alt_text || `Featured image for post ${postData.id}`,
        title: mediaObj.alt_text || `Featured image for post ${postData.id}`,
        mediaId: mediaObj.id,
        postId: mediaObj.post,
        featured: true
      })
    } else {
      console.log(`Warning: Featured media with ID ${postData.featured_media} not found for post: ${postData.slug}`)
    }
  }

  while (foundImage = imageRegex.exec(postData.content.rendered)) {
    let alt = `Image from post ${postData.id}`

    if (foundImage[0].includes('alt="')) {
      alt = foundImage[0].split('alt="')[1].split('"')[0] || `Image from post ${postData.id}`
    }

    bodyImages.push({
      link: foundImage[1],
      description: alt,
      title: alt,
      postId: postData.id,
      featured: false
    })
  }
  return bodyImages
}

function getPostLabels(postItems, labelType) {
  let labels = []
  let apiTag = getApiDataType(labelType)[0];

  // Add safety check for apiTag
  if (!apiTag || !apiTag.data) {
    console.log(`Warning: No ${labelType} data found`);
    return labels;
  }

  for (const labelId of postItems) {
    let labelName = apiTag.data.filter(obj => {
      if (obj.id === labelId) {
        return obj.name
      }
    });

    // Add safety check for labelName array
    if (labelName.length > 0 && labelName[0] && labelName[0].name) {
      labels.push(labelName[0].name)
    } else {
      console.log(`Warning: ${labelType} with ID ${labelId} not found`);
    }
  }

  return labels
}

/**
 * Helper function to get a specific data tree for a type of resource.
 * @param {String} resourceName - specific type of WP endpoint (e.g. posts, media)
 */
function getApiDataType(resourceName) {
  let apiType = apiData.filter(obj => {
    if (obj && obj.endpoint === resourceName && obj.success) {
      return obj
    }
  });
  
  if (apiType.length === 0) {
    console.log(`⚠️  No data found for resource type: ${resourceName}`)
    return []
  }
  
  return apiType
}

/**
 * Write all exported WP data to its own JSON file.
 * @param {Object} dataTree - JSON body of WordPress data
 * @param {*} dataType - type of WordPress API endpoint.
 */
function writeDataToFile(dataTree, dataType) {
  console.log(`Writing data to a file`)

  fs.writeFile(`./${dataType}.json`, JSON.stringify(dataTree, null, 2), (err) => {
    if (err) {
      console.error(err);
      return;
    };
    console.log(`...Done!`)
    console.log(logSeparator)
  });
}

/**
 * Create Contentful Client.
 */
function createForContentful() {
  console.log('🔗 Connecting to Contentful...')
  console.log(`Space ID: ${ctfData.spaceId}`)
  console.log(`Environment: ${ctfData.environment}`)
  
  ctfClient.getSpace(ctfData.spaceId)
  .then((space) => {
    console.log('✅ Successfully connected to Contentful space')
    return space.getEnvironment(ctfData.environment)
  })
  .then((environment) => {
    console.log('✅ Successfully accessed environment')
    // First, let's check what content types exist
    checkExistingContentTypes(environment);
  })
  .catch((error) => {
    console.error('❌ Error connecting to Contentful:')
    console.error('Status:', error.response?.status)
    console.error('Message:', error.message)
    console.error('Details:', error.response?.data)
    
    if (error.response?.status === 401) {
      console.error('\n🔑 Authentication Error - Check your access token:')
      console.error('1. Make sure your access token is a Content Management API token (starts with CFPAT-)')
      console.error('2. Verify the token has the correct permissions')
      console.error('3. Check if the token is still valid (not expired)')
    } else if (error.response?.status === 404) {
      console.error('\n🔍 Not Found Error:')
      console.error('1. Check if your Space ID is correct')
      console.error('2. Verify the environment name (usually "master")')
      console.error('3. Make sure you have access to this space')
    }
    
    process.exit(1)
  })
}

/**
 * Check what content types exist in the Contentful space
 * @param {String} environment - name of Contentful environment.
 */
function checkExistingContentTypes(environment) {
  console.log('🔍 Checking existing content types in Contentful space...')
  
  environment.getContentTypes()
    .then((contentTypes) => {
      console.log('📋 Available content types:')
      if (contentTypes.items.length === 0) {
        console.log('   No content types found in this space.')
      } else {
        contentTypes.items.forEach((contentType) => {
          console.log(`   - ID: "${contentType.sys.id}", Name: "${contentType.name}"`)
        })
      }
      
      // Check if our desired content type exists
      const targetContentType = contentTypes.items.find(ct => ct.sys.id === contentful_content_type)
      
      if (targetContentType) {
        console.log(`✅ Content type "${contentful_content_type}" found. Proceeding with migration...`)
        console.log(logSeparator)
        buildContentfulAssets(environment);
      } else {
        console.log(`❌ Content type "${contentful_content_type}" not found!`)
        console.log('\n📝 You need to either:')
        console.log('1. Create a content type with the ID "' + contentful_content_type + '" in Contentful, or')
        console.log('2. Change the contentType in your config.js to one of the existing content types above')
        console.log('\n🔧 If creating a new content type, make sure to add these fields:')
        console.log('   - postTitle (Short text)')
        console.log('   - slug (Short text)')
        console.log('   - content (Long text)')
        console.log('   - publishDate (Date & time)')
        console.log('   - featuredImage (Media - optional)')
        console.log('   - tags (Short text, list - optional)')
        console.log('   - categories (Short text, list - optional)')
        console.log(logSeparator)
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ Error checking content types:')
      console.error('Status:', error.response?.status)
      console.error('Message:', error.message)
      console.error('Details:', error.response?.data)
      process.exit(1)
    })
}

/**
 * Build data trees for Contentful assets.
 * @param {String} environment - name of Contentful environment.
 */
function buildContentfulAssets(environment) {
  let assetPromises = []

  console.log('Building Contentful Asset Objects')

  // For every image in every post, create a new asset.
  for (let [index, wpPost] of wpData.posts.entries()) {
    for (const [imgIndex, contentImage] of wpPost.contentImages.entries()) {
      // Ensure title and description are always strings
      const title = typeof contentImage.title === 'string' ? contentImage.title : `Image ${imgIndex + 1} from ${wpPost.slug}`;
      const description = typeof contentImage.description === 'string' ? contentImage.description : `Image ${imgIndex + 1} from ${wpPost.slug}`;
      
      let assetObj = {
        title: {
          'en-US': title
        },
        description: {
          'en-US': description
        },
        file: {
          'en-US': {
            contentType: 'image/jpeg',
            fileName: contentImage.link.split('/').pop(),
            upload: encodeURI(contentImage.link)
          }
        }
      }

      assetPromises.push(assetObj);
    }
  }

  let assets = []

  console.log(`Creating Contentful Assets...`)
  console.log(logSeparator)

  // getAndStoreAssets()

  createContentfulAssets(environment, assetPromises, assets)
    .then((result) => {
      console.log(`...Done!`)
      console.log(logSeparator)

      getAndStoreAssets(environment, assets)
    })
}

/**
 * Fetch all published assets from Contentful and store in a variable.
 * @param {String} environment - name of Contentful Environment.
 * @param {Array} assets - Array to store assets in.
 */
function getAndStoreAssets(environment, assets) {
  console.log(`Storing asset URLs in a global array to use later`)
    // Not supported with JS? Easier to get all assets and support
    axios.get(`https://api.contentful.com/spaces/${ctfData.spaceId}/environments/${ctfData.environment}/public/assets`,
    {
      headers: {
        'Authorization':`Bearer ${ctfData.accessToken}`
      }
    })
    .then((result) => {
      // console.log(result)
      contentfulData.assets = []
      for (const item of result.data.items) {
        contentfulData.assets.push(item.fields.file['en-US'].url)
      }

      createContentfulPosts(environment, assets)

    }).catch((err) => {
      console.log(err)
      return error
    });
    console.log(`...Done!`)
    console.log(logSeparator)
}

/**
 * Create a Promise to publish all assets.
 * Note that, Timeout might not be needed here, but Contentful
 * rate limits were being hit.
 * @param {String} environment - Contentful Environment
 * @param {Array} promises - Contentful Asset data trees
 * @param {Array} assets - array to store Assets in
 */
function createContentfulAssets(environment, promises, assets) {
  return Promise.all(
    promises.map((asset, index) => new Promise(async resolve => {

      let newAsset
      console.log(`🖼️  Creating asset ${index + 1}/${promises.length}: ${asset.file['en-US'].fileName}`)
      
      setTimeout(() => {
        environment.createAsset({
          fields: asset
        })
        .then((asset) => {
          console.log(`   ⏳ Processing: ${asset.fields.file['en-US'].fileName}`)
          return asset.processForAllLocales()
        })
        .then((asset) => {
          console.log(`   📤 Publishing: ${asset.fields.file['en-US'].fileName}`)
          return asset.publish()
        })
        .then((asset) => {
          console.log(`   ✅ Published: ${asset.fields.file['en-US'].fileName}`)
          assets.push({
            assetId: asset.sys.id,
            fileName: asset.fields.file['en-US'].fileName
          })
          resolve(asset)
        })
        .catch((error) => {
          console.error(`   ❌ Failed to create asset: ${asset.file['en-US'].fileName}`)
          console.error('   Error:', error.message)
          if (error.response?.data) {
            console.error('   Details:', error.response.data)
          }
          // Continue with other assets even if one fails
          resolve(null)
        })
      }, 1000 + (5000 * index));
    }))
  );
}

/**
 * For each WordPress post, build the data for a Contentful counterpart.
 * @param {String} environment - Name of Contentful Environment.
 * @param {Array} assets - array to store Assets in
 */
function createContentfulPosts(environment, assets) {
  console.log(`Creating Contentful Posts...`)
  console.log(logSeparator)

  // let postFields = {}
  /**
   * Dynamically build our Contentful data object
   * using the keys we built whilst reducing the WP Post data.alias
   *
   * Results:
   *  postTitle: {
   *    'en-US': wpPost.postTitle
   *   },
   *  slug: {
   *    'en-US': wpPost.slug
   *  },
   */
  let promises = []

  for (const [index, post] of wpData.posts.entries()) {
    let postFields = {}

    for (let [postKey, postValue] of Object.entries(post)) {
      // console.log(`postKey: ${postValue}`)
      if (postKey === 'content') {
        // Handle content based on configuration
        if (config.contentful.contentFormat === 'richtext') {
          // Convert HTML to Contentful RichText format
          postValue = convertToRichText(postValue)
          console.log(`   📝 Converting content to RichText format`)
        } else {
          // Convert HTML to markdown for Long Text fields
          postValue = turndownService.turndown(postValue)
          console.log(`   📝 Converting content to Markdown format`)
        }
      }

      // Handle tags and categories - convert arrays to comma-separated strings if needed
      if (postKey === 'tags' || postKey === 'categories') {
        if (Array.isArray(postValue)) {
          // If the field expects a single Symbol, join the array into a string
          postValue = postValue.join(', ')
        }
      }

      /**
       * Remove values/flags/checks used for this script that
       * Contentful doesn't need.
       */
      let keysToSkip = [
        'id',
        'type',
        'contentImages'
      ]

      if (!keysToSkip.includes(postKey)) {
        postFields[postKey] = {
          'en-US': postValue
        }
      }

      if (postKey === 'featuredImage' && postValue > 0) {
        let assetObj = assets.filter(asset => {
          if (asset.fileName === post.contentImages[0].link.split('/').pop()) {
            return asset
          }
        })[0];

        postFields.featuredImage = {
          'en-US': {
            sys: {
              type: 'Link',
              linkType: 'Asset',
              id: assetObj.assetId
            }
          }
        }
      }

      // No image and Contentful will fail if value is '0', so remove.
      if (postKey === 'featuredImage' && postValue === 0) {
        delete postFields.featuredImage
      }
    }
    promises.push(postFields)
  }

  console.log(`Post objects created, attempting to create entries...`)
  createContentfulEntries(environment, promises)
    .then((result) => {
      console.log(logSeparator);
      console.log(`Done!`);
      console.log(logSeparator);
      console.log(`The migration has completed.`)
      console.log(logSeparator);
    });
}

/**
 * For each post data tree, publish a Contentful entry.
 * @param {String} environment - Name of Contentful Environment.
 * @param {Array} promises - data trees for Contentful posts.
 */
function createContentfulEntries(environment, promises) {
  return Promise.all(promises.map((post, index) => new Promise(async resolve => {

    let newPost

    console.log(`📝 Creating post ${index + 1}/${promises.length}: ${post.slug['en-US']}`)

    setTimeout(() => {
      environment.createEntry(contentful_content_type, {
        fields: post
      })
      .then((entry) => {
        console.log(`   📤 Publishing: ${entry.fields.slug['en-US']}`)
        return entry.publish()
      })
      .then((entry) => {
        console.log(`   ✅ Success: ${entry.fields.slug['en-US']}`)
        resolve(entry)
      })
      .catch((error) => {
        console.error(`   ❌ Failed to create entry: ${post.slug['en-US']}`)
        console.error('   Error:', error.message)
        if (error.response?.data) {
          console.error('   Details:', JSON.stringify(error.response.data, null, 2))
        }
        // Continue with other entries even if one fails
        resolve(null)
      })
    }, 1000 + (5000 * index));
  })));
}

/**
 * Convert WordPress content to Contentful Rich Text
 * Ideally we'd be using Markdown here, but I like the RichText editor 🤡
 *
 * Note: Abandoned because it did not seem worth the effort.
 * Leaving this here in case anybody does decide to venture this way.
 *
 * @param {String} content - WordPress post content.
 */
function formatRichTextPost(content) {
  // TODO: split  at paragraphs, create a node for each.
  console.log(logSeparator)

  // turndownService.remove('code')
  let markdown = turndownService.turndown(content)

  // console.log(logSeparator)
  // console.log(markdown)

  // let imageLinks = /!\[[^\]]*\]\((.*?)\s*("(?:.*[^"])")?\s*\)/g
  // let imageRegex = /<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g

  // while (foundImage = imageLinks.exec(markdown)) {
    // console.log(foundImage[0])
    // let alt = foundImage[0].split('alt="')[1].split('"')[0]
  // }


  /**
   * https://www.contentful.com/developers/docs/concepts/rich-text/
   */

  /**
   *     "expected": [
          "blockquote",
          "embedded-asset-block",
          "embedded-entry-block",
          "heading-1",
          "heading-2",
          "heading-3",
          "heading-4",
          "heading-5",
          "heading-6",
          "hr",
          "ordered-list",
          "paragraph",
          "unordered-list"
        ]
   */

  // let contentor = {
  //   content: [
  //     {
  //       nodeType:"paragraph",
  //       data: {},
  //       content: [
  //         {
  //           value: content,
  //           nodeType:"text",
  //           marks: [],
  //           data: {}
  //         }
  //       ]
  //     },
  //     // {
  //     //   nodeType:"paragraph",
  //     //   data: {},
  //     //   content: [
  //     //     {
  //     //       value: "lorem hello world two",
  //     //       nodeType:"text",
  //     //       marks: [],
  //     //       data: {}
  //     //     }
  //     //   ]
  //     // },
  //   ],
  //   data: {},
  //   nodeType: 'document'
  // };

  return markdown
}

migrateContent();
