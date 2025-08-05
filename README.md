# A script to migrate posts from WordPress to Contentful.

This is a script that will export all posts from WordPress using the Rest API and import them into Contentful using the Content Management API.

I've used this script for my own personal site and decided to share it and document my process used to develop it so people can learn from it. The basis of the script is intended to be expanded on for your own specifc purpose, but you can use the script as-is by modifying a few things.

Full write-up can be found here:
https://ashcroft.dev/blog/script-migrate-wordpress-posts-contentful/

## How to use the script

This script will run in the terminal via Node. You need to have [npm installed]('https://www.npmjs.com/get-npm').

### Quick Setup

1. **Clone the repository**
   ```bash
   git clone git@github.com:jonashcroft/wp-to-contentful.git
   cd wp-to-contentful
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up configuration**
   ```bash
   npm run setup
   ```

4. **Edit your configuration in relation to WP & Contentful**
   Open `config.js` and update with:
   a. WordPress:
    - endpoint - Rest API endpoint of your WP site
    - importPostCount - Number of posts to be processed when running your migrat script

   b. Contentful:
    - AccessToken - Get the API key from your Contentful https://www.contentful.com/developers/docs/concepts/apis/
    - spaceId - YOu can get it from your App's URL https://www.contentful.com/help/spaces/find-space-id/
    - environment - by default master
    - contentType - blogPost is default but it varies in the your target Contentful site https://www.contentful.com/help/content-types/
    - contentFormat - richtext is the default

5. **Run the migration**
   ```bash
   npm run migrate
   ```

### Detailed Setup

### Add your details

#### 1. Set up configuration file

Copy the configuration template to create your config file:

```bash
cp config.template.js config.js
```

Open `config.js` and update it with your specific details:

```javascript
module.exports = {
  // WordPress API Configuration
  wordpress: {
    endpoint: 'https://your-site.com/wp-json/wp/v2/', // Replace with your WordPress site
    importPostCount: 300 // Number of posts to import (adjust as needed)
  },

  // Contentful Configuration
  contentful: {
    accessToken: 'CFPAT-your-contentful-access-token-here', // Your Content Management API token
    spaceId: 'your-space-id-here', // Your Contentful space ID
    environment: 'master', // Usually 'master' for production
    contentType: 'blogPost' // Your content type ID in Contentful
  }
};
```

**Important**: The `config.js` file contains sensitive information and is excluded from version control. Never commit this file to your repository.

#### 2. Get your Contentful credentials

In your Contentful admin panel:
1. Go to Settings → API keys
2. Create or select a Content Management API key
3. Copy the Space ID and Content Management Token
4. Update your `config.js` file with these credentials

#### 3. Customize field mapping (if needed)

```javascript
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
```
### Run the script

```bash
npm run migrate
# or
node migration.js
```

## Security Notes

- **Never commit sensitive credentials to version control**
- The `config.js` file is automatically excluded from git via `.gitignore`
- Your Contentful access tokens provide full access to your space - keep them secure
- Consider using environment variables in production environments

## Configuration Files

This project uses `config.js` to store sensitive configuration data. The following files are included:

- `config.template.js` - Template with example values (safe to commit)
- `config.js` - Your actual configuration (excluded from git)
- `.env.example` - Alternative environment variable setup (if you prefer .env files)

**IMPORTANT**: There is no sandbox or test environment with this script. If you run this script, it will immediately attempt to publish your new posts and assets - I am not responsible for anything that goes wrong.