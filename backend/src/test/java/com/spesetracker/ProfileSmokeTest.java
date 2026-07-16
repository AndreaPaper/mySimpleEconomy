package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Nickname, stipendio di default e giorno di arrivo dello stipendio: dati di profilo
// usati per personalizzare dashboard/previsioni, non collegati a nessuna transazione.
@SpringBootTest
@AutoConfigureMockMvc
class ProfileSmokeTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String registerAndLogin() throws Exception {
        String email = "profile+" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", email, "password", "password123"))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    @Test
    void newUserHasEmptyProfileThenCanUpdateIt() throws Exception {
        String token = registerAndLogin();

        MvcResult initial = mockMvc.perform(get("/api/profile")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode initialProfile = objectMapper.readTree(initial.getResponse().getContentAsString());
        assertThat(initialProfile.get("nickname").isNull()).isTrue();
        assertThat(initialProfile.get("defaultSalaryAmount").isNull()).isTrue();
        assertThat(initialProfile.get("salaryDay").isNull()).isTrue();

        MvcResult updated = mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"nickname":"Andrea","defaultSalaryAmount":1800.50,"salaryDay":27}
                                """))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode updatedProfile = objectMapper.readTree(updated.getResponse().getContentAsString());
        assertThat(updatedProfile.get("nickname").asText()).isEqualTo("Andrea");
        assertThat(updatedProfile.get("defaultSalaryAmount").asDouble()).isEqualTo(1800.50);
        assertThat(updatedProfile.get("salaryDay").asInt()).isEqualTo(27);

        MvcResult reread = mockMvc.perform(get("/api/profile")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode rereadProfile = objectMapper.readTree(reread.getResponse().getContentAsString());
        assertThat(rereadProfile.get("nickname").asText()).isEqualTo("Andrea");
        assertThat(rereadProfile.get("salaryDay").asInt()).isEqualTo(27);
    }

    @Test
    void rejectsInvalidSalaryDay() throws Exception {
        String token = registerAndLogin();

        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"nickname":"Andrea","salaryDay":32}
                                """))
                .andExpect(status().isBadRequest());
    }
}
