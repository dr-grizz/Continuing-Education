# Prototype course photos

Photos are stored locally in `src/web/public/course-images/` and served through Next.js Image. Grid covers use a 16:9 crop; list thumbnails are 144×108 on desktop and 88×88 on small screens. Images are decorative alongside the course titles, so their alt text is empty.

| Asset | Source / photographer |
| --- | --- |
| data-analysis-hd.jpg | [Unsplash source image](https://images.unsplash.com/photo-1599658880436-c61792e70672) |
| leadership-hd.jpg | [Discussion photograph](https://unsplash.com/photos/two-men-sitting-at-a-table-talking-to-each-other-CLhULgqR-xg), phyo min; page credits Thant Zin |
| healthcare-hd.jpg | [Stethoscope photograph](https://unsplash.com/photos/a-person-wearing-a-white-shirt-with-a-stethoscope-around-it-ty86ci2_iCc), Nappy |
| biblical-study-hd.jpg | [Open Bible](https://unsplash.com/photos/open-book-TNlHf4m4gpI), Aaron Burden |
| workplace-technology-hd.jpg | [Home office](https://unsplash.com/photos/wooden-standing-desk-in-home-office-tdnYk4qOGhc), ergonofis |

Source: [Unsplash License](https://unsplash.com/license). These are sample stock photos, not photographs of actual course participants. Newly created courses receive a category cover until per-course image management is implemented.

The active photos are 1920×1080 JPEGs. Responsive source sizing accounts for enlargement caused by `object-fit: cover`, including the tall featured-course thumbnails. Earlier unsuffixed images are retained but no longer displayed.
