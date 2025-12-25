import axios from "axios";

const GOOGLE_API_KEY = "your_api_key";
const NEARBY_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

// Helper function to get Place Details for each restaurant
const getPlaceDetails = async (placeId) => {
  const response = await axios.get(PLACE_DETAILS_URL, {
    params: {
      key: GOOGLE_API_KEY,
      place_id: placeId,
      language: "ja",
      fields: "name,formatted_address,formatted_phone_number,website,url,opening_hours,rating,user_ratings_total,price_level,wheelchair_accessible_entrance",
    },
  });
  return response.data.result;
};

// Align JavaScript getDay() to Google's weekday_text
const dayMapping = (day) => {
  const mapping = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
  return mapping[day];
};

// Clean localized time format but keep weekday
const cleanTimeWithWeekday = (timeText) =>
  timeText.replace(/時/g, ":").replace(/分/g, "").replace(/\s+/g, ""); // Converts "16時00分" to "16:00"

// Check if a restaurant is open at the provided time
const isRestaurantOpen = (providedDateTime, periods) => {
  const providedDay = providedDateTime.getDay();

  return periods.some((period) => {
    const openDay = period.open.day;
    const closeDay = period.close.day;

    const openTime = new Date(providedDateTime);
    openTime.setHours(parseInt(period.open.time.slice(0, 2)), parseInt(period.open.time.slice(2)), 0);

    const closeTime = new Date(providedDateTime);
    closeTime.setHours(parseInt(period.close.time.slice(0, 2)), parseInt(period.close.time.slice(2)), 0);

    if (closeTime < openTime) {
      closeTime.setDate(closeTime.getDate() + 1);
    }

    return openDay === providedDay && providedDateTime >= openTime && providedDateTime < closeTime;
  });
};

export const handler = async (event) => {
  try {
    const { latitude, longitude, radius = 500, date, time } = event.queryStringParameters;

    if (!latitude || !longitude || !radius || !date || !time) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required parameters: latitude, longitude, radius, date, or time.",
        }),
      };
    }

    const providedDateTime = new Date(`${date}T${time}`);
    if (isNaN(providedDateTime.getTime())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid date or time format." }),
      };
    }

    const nearbyResponse = await axios.get(NEARBY_SEARCH_URL, {
      params: {
        key: GOOGLE_API_KEY,
        location: `${latitude},${longitude}`,
        radius,
        type: "restaurant",
        language: "ja",
      },
    });

    const places = nearbyResponse.data.results;

    const openRestaurants = [];
    for (const place of places) {
      const details = await getPlaceDetails(place.place_id);

      if (details.opening_hours && details.opening_hours.periods) {
        if (isRestaurantOpen(providedDateTime, details.opening_hours.periods)) {
          const dayName = dayMapping(providedDateTime.getDay());
          const weekdayText =
            details.opening_hours.weekday_text
              .find((text) => text.startsWith(dayName)) || "Not available";

          openRestaurants.push({
            name: details.name,
            address: details.formatted_address,
            phone_number: details.formatted_phone_number || "null",
            website: details.website || "null",
            google_map_url: details.url,
            opening_hours: cleanTimeWithWeekday(weekdayText), // Clean the time format but keep weekday
            rating: details.rating || "null",
            user_ratings_total: details.user_ratings_total || 0,
            price_level: details.price_level || "null",
            wheelchair_accessible: details.wheelchair_accessible_entrance || "null",
          });
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        date,
        time,
        open_restaurants: openRestaurants,
      }),
    };

  } catch (error) {
    console.error("Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error",
        error: error.message,
      }),
    };
  }
};
