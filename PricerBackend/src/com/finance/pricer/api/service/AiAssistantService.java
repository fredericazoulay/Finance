package com.finance.pricer.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class AiAssistantService {
        private static final String ROLE_KEY = "role";
        private static final String CONTENT_KEY = "content";
    private static final String SYSTEM_PROMPT = "Tu es un assistant spécialisé en valorisation obligataire. "
            + "Réponds en français, explique les hypothèses et les limites, et appuie-toi uniquement sur les données fournies. "
            + "Ne présente pas une analyse indicative comme un conseil financier.";

    private final RestTemplate restTemplate;
    private final String chatCompletionsUrl;
    private final String apiKey;
    private final String model;

    public AiAssistantService(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${pricer.ai.chat-completions-url}") String chatCompletionsUrl,
            @Value("${pricer.ai.api-key:}") String apiKey,
            @Value("${pricer.ai.model:gpt-4o-mini}") String model) {
        this.restTemplate = restTemplateBuilder
                .setConnectTimeout(Duration.ofSeconds(5))
                .setReadTimeout(Duration.ofSeconds(45))
                .build();
        this.chatCompletionsUrl = chatCompletionsUrl == null ? "" : chatCompletionsUrl;
        this.apiKey = apiKey == null ? "" : apiKey;
        this.model = model;
    }

    public String answer(String question, String context) {
        if (apiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Assistant IA non configuré. Définissez PRICER_AI_API_KEY côté serveur.");
        }

        String userMessage = context == null || context.isBlank()
                ? question
                : question + "\n\nContexte de valorisation fourni :\n" + context;
        Map<String, Object> request = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of(ROLE_KEY, "system", CONTENT_KEY, SYSTEM_PROMPT),
                        Map.of(ROLE_KEY, "user", CONTENT_KEY, userMessage)
                ),
                "temperature", 0.2
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(Objects.requireNonNull(apiKey));
        try {
            ResponseEntity<JsonNode> response = restTemplate.postForEntity(
                    Objects.requireNonNull(chatCompletionsUrl), new HttpEntity<>(request, headers), JsonNode.class);
            JsonNode body = response.getBody();
            String answer = body == null
                    ? ""
                    : body.path("choices").path(0).path("message").path(CONTENT_KEY).asText("").trim();
            if (answer.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "Le fournisseur IA n’a pas retourné de réponse exploitable.");
            }
            return answer;
        } catch (RestClientException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Le service IA est momentanément indisponible.");
        }
    }
}