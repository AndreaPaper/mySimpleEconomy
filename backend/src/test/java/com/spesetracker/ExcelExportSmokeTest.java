package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Verifica che l'endpoint di esportazione produca un .xlsx leggibile contenente
// esattamente le transazioni create per l'utente.
class ExcelExportSmokeTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void exportProducesReadableWorkbookWithTransactions() throws Exception {
        String email = "export+" + UUID.randomUUID() + "@example.com";
        MvcResult registerResult = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", email, "password", "password123"))))
                .andExpect(status().isCreated())
                .andReturn();
        String token = objectMapper.readTree(registerResult.getResponse().getContentAsString()).get("token").asText();

        MvcResult categoryResult = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Spesa\",\"type\":\"EXPENSE\",\"color\":\"#3B82F6\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String categoryId = objectMapper.readTree(categoryResult.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(post("/api/transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","amount":42.50,"type":"EXPENSE","occurredOn":"%s","description":"Test export"}
                                """.formatted(categoryId, LocalDate.now())))
                .andExpect(status().isCreated());

        MvcResult exportResult = mockMvc.perform(get("/api/export/excel")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();

        byte[] content = exportResult.getResponse().getContentAsByteArray();
        assertThat(content).isNotEmpty();

        try (Workbook workbook = new XSSFWorkbook(new ByteArrayInputStream(content))) {
            // Il foglio 0 è il riepilogo per mese; le transazioni stanno nei fogli
            // successivi, uno per mese.
            Sheet summary = workbook.getSheetAt(0);
            assertThat(summary.getSheetName()).isEqualTo("Riepilogo");
            assertThat(summary.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Mese");

            Sheet sheet = workbook.getSheetAt(1);
            Row header = sheet.getRow(0);
            assertThat(header.getCell(0).getStringCellValue()).isEqualTo("Data");

            Row dataRow = sheet.getRow(1);
            assertThat(dataRow.getCell(1).getStringCellValue()).isEqualTo("Spesa");
            assertThat(dataRow.getCell(2).getStringCellValue()).isEqualTo("EXPENSE");
            assertThat(dataRow.getCell(3).getStringCellValue()).isEqualTo("No");
            assertThat(dataRow.getCell(4).getNumericCellValue()).isEqualTo(42.50);
            assertThat(dataRow.getCell(5).getStringCellValue()).isEqualTo("Test export");
        }
    }
}
