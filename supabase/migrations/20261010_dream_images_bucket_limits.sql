-- The private `dream-images` bucket accepted any file type of any size from a signed-in user (into their own folder). Limit uploads to
-- approved image types and a sensible size.
--
-- What the app uploads: ONE jpeg per saved dream (the generated image, 1536x1024, `{owner}/{dream}.jpg`, ~120 KB on average, the
-- largest stored today 189 KB). 5 MB leaves a wide margin for a larger generated image; png/webp are accepted as approved image
-- types should the image provider's output format ever change.
--
-- These limits are checked by the Storage API when something is UPLOADED. They never touch an object that is already stored
-- (all 27 existing images are image/jpeg, below 190 KB) and never affect reading, signed URLs, or deleting.
--
-- ROLLBACK: update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'dream-images';

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'dream-images';
