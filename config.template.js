/**
 * Configuration Template
 * Copy this file to config.js and fill in your actual values
 * config.js is excluded from version control for security
 */

module.exports = {
  // WordPress API Configuration
  wordpress: {
    // Main WordPress endpoint
    endpoint: 'https://your-site.com/wp-json/wp/v2/',
    // Limit the number of posts to import
    importPostCount: 2
  },

  // Contentful Configuration
  contentful: {
    // Your Contentful Management API access token
    // Get this from: Contentful > Settings > API keys > Content management tokens
    accessToken: 'CFPAT-your-contentful-access-token-here',
    
    // Your Contentful space ID
    // Found in: Contentful > Settings > General settings
    spaceId: 'your-space-id-here',
    
    // Environment (usually 'master' for production)
    environment: 'master',
    
    // Content type ID to create entries as
    // Common content type names: 'blogPost', 'post', 'article', 'blog', 'page'
    // You need to create this content type in Contentful first or use an existing one
    contentType: 'blogPost',
    
    // Content format - 'richtext' for RichText fields, 'markdown' for Long Text fields
    contentFormat: 'richtext'
  }
};
