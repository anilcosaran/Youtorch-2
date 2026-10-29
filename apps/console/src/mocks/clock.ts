/**
 * "Today" for the sample data: usage, model stats and promo end dates are all dated against it. It is fixed
 * because prerendered pages can't read the clock; the API will return data and prices as of each request.
 */
export const sampleToday = "2026-10-26";

export const sampleNow = Date.parse(`${sampleToday}T00:00:00Z`);
