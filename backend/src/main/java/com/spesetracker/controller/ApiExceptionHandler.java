package com.spesetracker.controller;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * I vincoli su parametri di query e path (@Min/@Max/@Positive sui controller annotati
 * con @Validated) sollevano ConstraintViolationException, che senza questo handler
 * risulterebbe in un 500: un input non valido del client deve invece dare 400, come
 * già accade per i body annotati con @Valid (gestiti nativamente da Spring).
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ConstraintViolationException.class)
    public ProblemDetail handleConstraintViolation(ConstraintViolationException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
    }
}
