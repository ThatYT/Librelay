package com.admin.common.utils;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import java.io.IOException;

/** Do not let Jackson silently truncate fractional listening ports. */
public class PortNumberDeserializer extends JsonDeserializer<Integer> {
    @Override
    public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        String value = parser.getText();
        if (parser.currentToken() == JsonToken.VALUE_NUMBER_INT
                || parser.currentToken() == JsonToken.VALUE_STRING && value.matches("-?[0-9]+")) {
            try { return Integer.valueOf(value); } catch (NumberFormatException ignored) { }
        }
        throw InvalidFormatException.from(parser, "Port must be an integer between 1 and 65535", value, Integer.class);
    }
}
