package com.spesetracker.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserDetailsServiceImpl userDetailsService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith(BEARER_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(BEARER_PREFIX.length());

        if (jwtService.isTokenValid(token) && SecurityContextHolder.getContext().getAuthentication() == null) {
            // Un token puo' essere firmato bene, non scaduto, e riferirsi a un utente che non
            // c'e' piu': basta cancellare l'account con una sessione ancora aperta nel browser.
            // Senza questa cattura l'eccezione esce dal filtro e diventa un 500, cioe' un
            // guasto del server; il client mostra un errore e non manda l'utente al login.
            // Lasciando invece il contesto vuoto la richiesta prosegue non autenticata e
            // Spring Security risponde 401, che e' quello che e' successo davvero.
            try {
                UserDetails userDetails = userDetailsService.loadUserByUsername(extractEmail(token));

                var authToken = new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities());
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            } catch (UsernameNotFoundException ignored) {
                // richiesta non autenticata: ci pensa Spring Security
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractEmail(String token) {
        return jwtService.extractClaims(token).get("email", String.class);
    }
}
